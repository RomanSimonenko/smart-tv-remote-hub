import {validateJpeg,ArtifactError} from '../test-runs/artifacts.js';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {MAX_SNAPSHOT_BYTES,ocrDiagnosticsSchema} from '@remote-webos-tv/contracts';
import {OcrError,type OcrRecognizer} from './recognizer.js';
export function registerOcrDiagnostics(app:FastifyInstance,ocr:OcrRecognizer,sessionForRequest:(request:FastifyRequest)=>string|undefined,onRevoke:(listener:(token:string)=>void)=>()=>void){
 const active=new Map<AbortController,string>();
 const unsubscribe=onRevoke(token=>{for(const [controller,owner]of active)if(owner===token)controller.abort();});
 let closing=false,limiter:ReturnType<FastifyInstance['createRateLimit']>|undefined;
 app.addHook('preClose',async()=>{closing=true;for(const controller of active.keys())controller.abort();});
 app.addHook('onClose',async()=>unsubscribe());
 app.register(async scoped=>{
  const bodyLimit=MAX_SNAPSHOT_BYTES;
  if(!scoped.hasContentTypeParser('image/jpeg'))scoped.addContentTypeParser('image/jpeg',{parseAs:'buffer',bodyLimit},(_request,body,done)=>done(null,body));
  scoped.post('/api/camera/ocr',{bodyLimit,logLevel:'warn'},async(request,reply)=>{
   const error=(status:number,code:string)=>reply.code(status).send({code,message:code,requestId:request.id});
   const owner=sessionForRequest(request);if(!owner)return error(401,'UNAUTHORIZED');
   if(closing)return error(503,'OCR_UNAVAILABLE');
   if(!Buffer.isBuffer(request.body)||!request.body.length)return error(400,'BAD_REQUEST');
   limiter??=app.createRateLimit({max:10,timeWindow:60_000,keyGenerator:()=> 'owner-ocr-diagnostics'});
   const admission=await limiter(request);if(!admission.isAllowed&&admission.isExceeded)return error(429,'RATE_LIMITED');
   if(!sessionForRequest(request))return error(401,'UNAUTHORIZED');
   if(closing||request.raw.aborted||reply.raw.destroyed)return error(503,'OCR_CANCELLED');
   try{validateJpeg(request.body);}catch(cause){if(cause instanceof ArtifactError&&cause.code==='INVALID_SNAPSHOT')return error(400,'INVALID_SNAPSHOT');throw cause;}
   const controller=new AbortController();active.set(controller,owner);
   const abort=()=>controller.abort();const closed=()=>{if(!reply.raw.writableFinished)abort();};
   request.raw.once('aborted',abort);reply.raw.once('close',closed);
   const start=performance.now();
   try{
    const result=await ocr.recognize(request.body,controller.signal);
    if(!sessionForRequest(request))return error(401,'UNAUTHORIZED');
    if(controller.signal.aborted)return error(503,'OCR_CANCELLED');
    return ocrDiagnosticsSchema.parse({...result,elapsedMs:Math.round(performance.now()-start)});
   }catch(cause){
    if(!sessionForRequest(request))return error(401,'UNAUTHORIZED');
    if(cause instanceof OcrError&&cause.code==='OCR_BUSY')return error(429,'OCR_BUSY');
    if(cause instanceof OcrError&&cause.code==='OCR_TIMEOUT')return error(504,'OCR_TIMEOUT');
    if(controller.signal.aborted)return error(503,'OCR_CANCELLED');
    app.log.warn({code:'OCR_DIAGNOSTICS_FAILED'},'Camera text recognition failed');
    return error(503,'OCR_FAILED');
   }finally{active.delete(controller);request.raw.off('aborted',abort);reply.raw.off('close',closed);}
  });
 });
}
