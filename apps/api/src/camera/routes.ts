import type {FastifyInstance,FastifyRequest} from 'fastify';
import {Worker} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {cameraPriorSchema,cameraPreviewSchema} from '@remote-webos-tv/contracts';

/** Bounded preview and snapshot processing, isolated from the API's TV command event loop. */
export function registerCameraRoutes(app:FastifyInstance,sessionForRequest:(r:FastifyRequest)=>string|undefined,createWorker=()=>new Worker(createRequire(import.meta.url).resolve('@remote-webos-tv/screen-vision/worker'))){
 for(const kind of ['preview','snapshot'] as const){
 const snapshot=kind==='snapshot',bodyLimit=(snapshot?8:4)*1024*1024;
 let worker:Worker|undefined,pending:{reject:(e:Error)=>void}|undefined,closing=false;
 let limiter:ReturnType<FastifyInstance['createRateLimit']>|undefined;
 const close=async()=>{closing=true;pending?.reject(new Error('Camera worker closed'));if(worker)await worker.terminate();worker=undefined;};
 app.addHook('preClose',close);
 app.register(async scoped=>{
  scoped.addContentTypeParser('image/png',{parseAs:'buffer',bodyLimit},(_r,body,done)=>done(null,body));
  scoped.post(`/api/camera/${kind}`,{bodyLimit,logLevel:'warn'},async(request,reply)=>{
   const error=(status:number,code:string)=>reply.code(status).send({code,message:code,requestId:request.id});
   if(!sessionForRequest(request))return error(401,'UNAUTHORIZED');
   limiter??=app.createRateLimit({max:snapshot?300:900,timeWindow:60_000,keyGenerator:()=> `owner-camera-${kind}`});
   const admission=await limiter(request);if(!admission.isAllowed&&admission.isExceeded)return error(429,'RATE_LIMITED');
   if(closing||reply.raw.destroyed||request.raw.aborted)return error(503,'CAMERA_UNAVAILABLE');
   if(!Buffer.isBuffer(request.body)||request.headers['content-type']!=='image/png')return error(400,'BAD_REQUEST');
   let prior;
   try{prior=request.headers['x-screen-prior']?cameraPriorSchema.parse(JSON.parse(String(request.headers['x-screen-prior']))):undefined;}catch{return error(400,'BAD_REQUEST');}
   if(snapshot&&!prior)return error(400,'BAD_REQUEST');
   if(pending)return error(429,'RATE_LIMITED');
   if(!worker){const created=createWorker();worker=created;created.on('error',()=>{if(worker===created)worker=undefined;app.log.error({code:'CAMERA_WORKER_FAILED'},'Camera processing worker failed');});}
   const active=worker;
   try{
    const result=await new Promise<unknown>((resolve,reject)=>{
     const finish=(cause?:Error,value?:unknown)=>{clearTimeout(timer);active.off('message',message);active.off('error',failed);active.off('exit',exited);request.raw.off('aborted',aborted);reply.raw.off('close',closed);cause?reject(cause):resolve(value);};
     const message=(value:unknown)=>finish(undefined,value),failed=(cause:Error)=>{worker=undefined;finish(cause);},exited=()=>failed(new Error('Camera worker exited'));
     const aborted=()=>{void active.terminate();worker=undefined;finish(new Error('Camera request aborted'));};
     const closed=()=>{if(!reply.raw.writableFinished)aborted();};
     const timer=setTimeout(()=>{void active.terminate();worker=undefined;finish(new Error('Camera processing timeout'));},5000);
     pending={reject:cause=>finish(cause)};
     active.once('message',message);active.once('error',failed);active.once('exit',exited);request.raw.once('aborted',aborted);reply.raw.once('close',closed);
     active.postMessage({image:request.body,snapshot,...(prior?{prior}:{})});
    });
    const parsed=cameraPreviewSchema.safeParse(result);
    if(!parsed.success){
     if(result&&typeof result==='object'&&'error' in result&&result.error==='INVALID_CAMERA_FRAME')return error(422,'INVALID_CAMERA_FRAME');
     app.log.error({code:'CAMERA_PROCESSING_FAILED'},'Camera preview processing failed');return error(503,'CAMERA_UNAVAILABLE');
    }
    if(!sessionForRequest(request))return error(401,'UNAUTHORIZED');
    return parsed.data;
   }catch{return error(503,'CAMERA_UNAVAILABLE');}finally{pending=undefined;}
  });
 });
 }
}
