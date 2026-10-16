import sharp from 'sharp';
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {pixelRegion,type Region,type Box} from './region.js';
export interface OcrObservation{text:string;confidence:number;words:Array<{text:string;confidence:number;box:Box}>}
export async function withOcrWorker<W extends {terminate:()=>Promise<void>},T>(create:()=>Promise<W>,run:(worker:W)=>Promise<T>,signal:AbortSignal):Promise<T>{
 signal.throwIfAborted();const worker=await create();
 let onAbort:()=>void=()=>{};
 try{
  signal.throwIfAborted();
  const aborted=new Promise<never>((_,reject)=>{onAbort=()=>reject(signal.reason instanceof Error?signal.reason:new Error('OCR aborted'));signal.addEventListener('abort',onAbort,{once:true});});
  return await Promise.race([run(worker),aborted]);
 }finally{signal.removeEventListener('abort',onAbort);await worker.terminate();}
}
export async function recognizeText(imagePath:string,region:Region,language:'rus'|'eng'|'rus+eng',signal:AbortSignal):Promise<OcrObservation>{
 signal.throwIfAborted();
 const metadata=await sharp(imagePath).metadata();
 if(!metadata.width||!metadata.height)throw new Error('Invalid image dimensions');
 const crop=pixelRegion(region,metadata.width,metadata.height);
 const dir=await mkdtemp(join(tmpdir(),'visual-ocr-'));
 try{
  await sharp(imagePath).extract({left:crop.x,top:crop.y,width:crop.width,height:crop.height}).png().toFile(join(dir,'frame.png'));
  const require=createRequire(import.meta.url);
  for(const lang of language.split('+')){
   if(lang!=='rus'&&lang!=='eng')throw new Error('Unsupported OCR language');
   await copyFile(join(dirname(require.resolve(`@tesseract.js-data/${lang}`)),'4.0.0',`${lang}.traineddata.gz`),join(dir,`${lang}.traineddata.gz`));
  }
  return await withOcrWorker(async()=>{
   const child=fork(fileURLToPath(new URL('../src/ocr-worker.mjs',import.meta.url)),[dir,language],{stdio:['ignore','ignore','pipe','ipc'],execArgv:[]});
   const exited=Promise.withResolvers<void>();child.once('close',()=>exited.resolve());
   const observation=new Promise<OcrObservation>((resolve,reject)=>{
    let stderr='';child.stderr?.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-2000);});
    child.once('error',reject);
    child.once('message',(message:unknown)=>{
     const result=message as {observation?:OcrObservation;error?:string};
     if(result.error)reject(new Error(result.error));
     else if(result.observation)resolve(result.observation);
     else reject(new Error('Invalid OCR worker response'));
    });
    child.once('exit',code=>reject(new Error(`OCR worker exited (${code}): ${stderr.replaceAll(dir,'<temporary>')}`)));
   });
   // Attach rejection handling immediately, including cancellation before run().
   void observation.catch(()=>{});
   return{observation,terminate:async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited.promise;}};
  },async worker=>{
   const observation=await worker.observation;
   return{...observation,words:observation.words.map(word=>({...word,box:{...word.box,x:word.box.x+crop.x,y:word.box.y+crop.y}}))};
  },signal);
 }finally{await rm(dir,{recursive:true,force:true});}
}
