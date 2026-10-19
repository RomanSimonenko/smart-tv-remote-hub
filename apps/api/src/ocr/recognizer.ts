import {spawn as spawnProcess,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ocrBlockSchema,matchTextConditions,type OcrBlock} from '@remote-webos-tv/contracts';

export interface OcrRecognition {blocks:OcrBlock[];engine:string;model:string}
export interface OcrRecognizer {warmup?():Promise<void>;recognize(image:Buffer,signal:AbortSignal,expected?:string[]):Promise<OcrRecognition>;close():Promise<void>}
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

/** Share one worker across startup warmup and real jobs; failures discard the process. */
export function createOcrRecognizer(options:{spawn?:()=>ChildProcessWithoutNullStreams}={}):OcrRecognizer & {warmup():Promise<void>} {
 const start=options.spawn??(()=>spawnProcess(process.env.REMOTE_WEBOS_OCR_PYTHON||'python3',[fileURLToPath(new URL('./worker.py',import.meta.url))],{stdio:'pipe'}));
 interface Worker {child:ChildProcessWithoutNullStreams;done:Promise<void>;stopping:boolean;failure?:Error}
 interface Job {worker:Worker;failure?:Error;consume(chunk:Buffer):void;cancel(error:Error):void;finish(error?:Error,value?:OcrRecognition):void}
 let closed=false,sequence=0,worker:Worker|undefined,active:Job|undefined;
 function terminate(current:Worker){if(!current.stopping){current.stopping=true;current.child.kill('SIGKILL');}}
 function acquire():Worker{
  if(worker)return worker;
  let child:ChildProcessWithoutNullStreams;
  try{child=start();}catch{throw new Error('OCR process could not start');}
  let exited!:()=>void;const current:Worker={child,done:new Promise<void>(resolve=>{exited=resolve;}),stopping:false};worker=current;
  child.stderr.resume(); // Never relay engine diagnostics, file paths or screen contents.
  child.stdout.on('data',(chunk:Buffer)=>{
   if(active?.worker===current)active.consume(chunk);
   else terminate(current); // Unsolicited idle output must never become another job's evidence.
  });
  child.on('error',()=>{current.failure=new Error('OCR process could not start');terminate(current);});
  child.stdin.on('error',()=>{if(active?.worker===current)active.cancel(new Error('OCR image delivery failed'));else terminate(current);});
  child.once('close',(code:number|null)=>{
   if(worker===current)worker=undefined;
   if(active?.worker===current)active.finish(active.failure??current.failure??new Error(`OCR process failed (exit ${code??'signal'})`));
   exited();
  });
  return current;
 }
 async function run(image:Buffer|null,signal:AbortSignal,expected:string[]=[],timeoutMs=30_000):Promise<OcrRecognition>{
   if(closed)throw new Error('OCR closed');
   if(signal.aborted)throw new Error('OCR aborted');
   if(active||worker?.stopping)throw new OcrError('OCR_BUSY','OCR busy');
   const current=acquire(),child=current.child,id=++sequence;
   return await new Promise<OcrRecognition>((resolve,reject)=>{
    let requestedRegions=0,size=0,buffered=Buffer.alloc(0),base:OcrRecognition|undefined,response:OcrRecognition|undefined,finished=false;
    const invalid=()=>new OcrError('OCR_INVALID_RESPONSE','OCR invalid response');
    const abort=()=>job.cancel(new Error('OCR aborted'));
    const timeout=setTimeout(()=>job.cancel(new OcrError('OCR_TIMEOUT','OCR timed out')),timeoutMs);
    const job:Job={worker:current,
     cancel(error){if(!job.failure){job.failure=error;terminate(current);}},
     finish(error,value){
      if(finished)return;finished=true;clearTimeout(timeout);signal.removeEventListener('abort',abort);
      if(active===job)active=undefined;
      if(error)reject(error);else resolve(value!);
     },
     consume(chunk){
      if(job.failure)return;size+=chunk.length;if(size>MAX_RESPONSE_BYTES){job.cancel(new Error('OCR response exceeds limit'));return;}
      buffered=Buffer.concat([buffered,chunk]);
      try{let end:number;
       while((end=buffered.indexOf(10))>=0){
        const message=JSON.parse(buffered.subarray(0,end).toString('utf8'));buffered=buffered.subarray(end+1);
        if(!message||typeof message!=='object'||message.id!==id)throw invalid();
        const value=parseResponse(Buffer.from(JSON.stringify(message.result)));
        if(message.phase==='base'&&!base&&!response){
         base=value;
         // Compact whitespace selects candidates only; the canonical matcher decides success.
         const compact=(text:string)=>text.normalize('NFC').toLowerCase().replace(/\s/gu,'');
         const retryIndices=new Set<number>(),limit=Math.min(3,1000-base.blocks.length);
         for(const condition of matchTextConditions(expected,base.blocks).filter(condition=>!condition.found)){
          for(let index=0;index<base.blocks.length&&retryIndices.size<limit;index++)if(compact(base.blocks[index]!.text)===compact(condition.expected))retryIndices.add(index);
         }
         requestedRegions=retryIndices.size;child.stdin.write(JSON.stringify({id,retryIndices:[...retryIndices]})+'\n');
        }else if(message.phase==='result'&&base&&!response){
         if(value.engine!==base.engine||value.blocks.length<base.blocks.length||value.blocks.length>base.blocks.length+requestedRegions||base.blocks.some((block,index)=>block.text!==value.blocks[index]?.text))throw invalid();
         response=value;
        }else throw invalid();
       }
       if(response){if(buffered.length)throw invalid();job.finish(undefined,response);}
      }catch{job.cancel(invalid());}
     }
    };
    active=job;signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted)abort();
    try{if(!job.failure){child.stdin.write(JSON.stringify(image===null?{id,warmup:true}:{id,imageBytes:image.length})+'\n');if(image!==null)child.stdin.write(image);}}catch{job.cancel(new Error('OCR image delivery failed'));}
   });
  }
 return{
  warmup:async()=>{await run(null,new AbortController().signal,[],120_000);},
  recognize:(image,signal,expected)=>run(image,signal,expected),
  async close(){closed=true;const current=worker;if(current){if(active?.worker===current)active.cancel(new Error('OCR closed'));else terminate(current);await current.done;}}
 };
}
