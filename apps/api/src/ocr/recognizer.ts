import {spawn as spawnProcess,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {createRequire} from 'node:module';
import {ocrBlockSchema,type OcrBlock} from '@remote-webos-tv/contracts';

export interface OcrRecognition {blocks:OcrBlock[];engine:string;model:string}
export interface OcrRecognizer {recognize(image:Buffer,signal:AbortSignal):Promise<OcrRecognition>;close():Promise<void>}
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
 let temporaryDirectory:string|undefined;
 const cleanup=()=>{if(temporaryDirectory){rmSync(temporaryDirectory,{recursive:true,force:true});temporaryDirectory=undefined;}};
 const start=options.spawn??(()=>{
  temporaryDirectory=mkdtempSync(join(tmpdir(),'screen-ocr-'));
  const require=createRequire(import.meta.url);
  for(const language of ['rus','eng'])copyFileSync(join(dirname(require.resolve(`@tesseract.js-data/${language}`)),'4.0.0',`${language}.traineddata.gz`),join(temporaryDirectory,`${language}.traineddata.gz`));
  return spawnProcess(process.execPath,[fileURLToPath(new URL('./worker.mjs',import.meta.url)),temporaryDirectory],{stdio:'pipe'});
 });
 let closed=false;
 let active:{cancel:(error:Error)=>void;done:Promise<void>}|undefined;
 return{
  async recognize(image,signal){
   if(closed)throw new Error('OCR closed');
   if(signal.aborted)throw new Error('OCR aborted');
   if(active)throw new OcrError('OCR_BUSY','OCR busy');
   let child:ChildProcessWithoutNullStreams;
   try{child=start();}catch{cleanup();throw new Error('OCR process could not start');}
   let finish!:()=>void;
   const done=new Promise<void>(resolve=>{finish=resolve;});
   let failure:Error|undefined;
   const cancel=(error:Error)=>{if(!failure){failure=error;child.kill('SIGKILL');}};
   active={cancel,done};
   const abort=()=>cancel(new Error('OCR aborted'));
   const timeout=setTimeout(()=>cancel(new OcrError('OCR_TIMEOUT','OCR timed out')),30_000);
   let size=0;const chunks:Buffer[]=[];
   const onData=(chunk:Buffer)=>{size+=chunk.length;if(size>MAX_RESPONSE_BYTES){cancel(new Error('OCR response exceeds limit'));return;}chunks.push(chunk);};
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
     else{try{resolve(parseResponse(Buffer.concat(chunks)));}catch(error){reject(error);}}
     finish();
    });
   });
   signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted)abort();
   try{if(!failure)child.stdin.end(image);return await output;}
   finally{await done;active=undefined;cleanup();}
  },
  async close(){closed=true;const pending=active;if(pending){pending.cancel(new Error('OCR closed'));await pending.done;}}
 };
}
