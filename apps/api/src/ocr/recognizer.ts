import {spawn as spawnProcess,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ocrBlockSchema,matchTextConditions,type OcrBlock} from '@remote-webos-tv/contracts';

export interface OcrRecognition {blocks:OcrBlock[];engine:string;model:string}
export interface OcrRecognizer {recognize(image:Buffer,signal:AbortSignal,expected?:string[]):Promise<OcrRecognition>;close():Promise<void>}
export class OcrError extends Error{constructor(readonly code:string,message:string){super(message);}}
const MAX_RESPONSE_BYTES=1024*1024;

function parseResponse(bytes:Buffer):OcrRecognition {
 let value:unknown;
 try{value=JSON.parse(bytes.toString('utf8'));}catch{throw new OcrError('OCR_INVALID_RESPONSE','OCR invalid response');}
 if(!value||typeof value!=='object')throw new OcrError('OCR_INVALID_RESPONSE','OCR invalid response');
 const result=value as Record<string,unknown>;
 if(!Array.isArray(result.blocks)||result.blocks.length>1000||typeof result.engine!=='string'||!result.engine||result.engine.length>100||typeof result.model!=='string'||!result.model||result.model.length>200)throw new OcrError('OCR_INVALID_RESPONSE','OCR invalid response');
 const blocks=result.blocks.map((block:unknown)=>{
  const parsed=ocrBlockSchema.safeParse(block);if(!parsed.success)throw new OcrError('OCR_INVALID_RESPONSE','OCR invalid response');return parsed.data;
 });
 return{blocks,engine:result.engine,model:result.model};
}

/** One disposable process per image, including initialization, so cancellation also stops model loading. */
export function createOcrRecognizer(options:{spawn?:()=>ChildProcessWithoutNullStreams}={}):OcrRecognizer {
 const start=options.spawn??(()=>spawnProcess(process.env.REMOTE_WEBOS_OCR_PYTHON||'python3',[fileURLToPath(new URL('./worker.py',import.meta.url))],{stdio:'pipe'}));
 let closed=false;
 let active:{cancel:(error:Error)=>void;done:Promise<void>}|undefined;
 return{
  async recognize(image,signal,expected=[]){
   if(closed)throw new Error('OCR closed');
   if(signal.aborted)throw new Error('OCR aborted');
   if(active)throw new OcrError('OCR_BUSY','OCR busy');
   let child:ChildProcessWithoutNullStreams;
   try{child=start();}catch{throw new Error('OCR process could not start');}
   let finish!:()=>void;
   const done=new Promise<void>(resolve=>{finish=resolve;});
   let failure:Error|undefined;
   const cancel=(error:Error)=>{if(!failure){failure=error;child.kill('SIGKILL');}};
   active={cancel,done};
   const abort=()=>cancel(new Error('OCR aborted'));
   const timeout=setTimeout(()=>cancel(new OcrError('OCR_TIMEOUT','OCR timed out')),30_000);
   let requestedRegions=0;let size=0;let buffered=Buffer.alloc(0);let base:OcrRecognition|undefined;let response:OcrRecognition|undefined;
   const invalid=()=>new OcrError('OCR_INVALID_RESPONSE','OCR invalid response');
   const onData=(chunk:Buffer)=>{
    if(failure)return;size+=chunk.length;if(size>MAX_RESPONSE_BYTES){cancel(new Error('OCR response exceeds limit'));return;}
    buffered=Buffer.concat([buffered,chunk]);
    try{let end:number;
     while((end=buffered.indexOf(10))>=0){
      const message=JSON.parse(buffered.subarray(0,end).toString('utf8'));buffered=buffered.subarray(end+1);
      if(!message||typeof message!=='object')throw invalid();
      const value=parseResponse(Buffer.from(JSON.stringify(message.result)));
      if(message.phase==='base'&&!base&&!response){
       base=value;
       // Removing whitespace selects candidates only; the canonical matcher decides success.
       const compact=(text:string)=>text.normalize('NFC').toLowerCase().replace(/\s/gu,'');
       const retryIndices=new Set<number>();const limit=Math.min(3,1000-base.blocks.length);
       for(const condition of matchTextConditions(expected,base.blocks).filter(condition=>!condition.found)){
        for(let index=0;index<base.blocks.length&&retryIndices.size<limit;index++){
         if(compact(base.blocks[index]!.text)===compact(condition.expected))retryIndices.add(index);
        }
       }
       requestedRegions=retryIndices.size;
       child.stdin.end(JSON.stringify({retryIndices:[...retryIndices]})+'\n');
      }else if(message.phase==='result'&&base&&!response){
       if(value.engine!==base.engine||value.blocks.length<base.blocks.length||value.blocks.length>base.blocks.length+requestedRegions||base.blocks.some((block,index)=>block.text!==value.blocks[index]?.text))throw invalid();
       response=value;
      }else throw invalid();
     }
    }catch{cancel(invalid());}
   };
   // Never relay engine diagnostics: they may include file paths and screen text.
   child.stderr.resume();
   const output=new Promise<OcrRecognition>((resolve,reject)=>{
    child.stdout.on('data',onData);
    child.on('error',()=>{failure??=new Error('OCR process could not start');});
    child.stdin.on('error',()=>cancel(new Error('OCR image delivery failed')));
    child.once('close',(code:number|null)=>{
     clearTimeout(timeout);signal.removeEventListener('abort',abort);child.stdout.removeListener('data',onData);
     if(!failure&&code!==0)failure=new Error(`OCR process failed (exit ${code??'signal'})`);
     if(failure)reject(failure);
     else{try{if(!response||buffered.length)throw invalid();resolve(response);}catch(error){reject(error);}}
     finish();
    });
   });
   signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted)abort();
   try{if(!failure){child.stdin.write(JSON.stringify({imageBytes:image.length})+'\n');child.stdin.write(image);}return await output;}
   finally{await done;active=undefined;}
  },
  async close(){closed=true;const pending=active;if(pending){pending.cancel(new Error('OCR closed'));await pending.done;}}
 };
}
