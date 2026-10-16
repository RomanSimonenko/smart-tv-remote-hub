import type {FastifyInstance,FastifyRequest} from 'fastify';
import {MAX_SNAPSHOT_BYTES,startTestRunSchema,testRunSchema,testRunsResponseSchema,testCaseIdSchema,runFailureSchema} from '@remote-webos-tv/contracts';
import {RunError,type TestRunService} from './service.js';
import {RunConflictError} from './repository.js';
import {ArtifactError,type ArtifactStore} from './artifacts.js';
import type {TvDeviceRegistry} from '../tv/device-registry.js';
export function registerTestRunRoutes(app:FastifyInstance,{service,artifacts,tvs,sessionForRequest}:{service:TestRunService;artifacts:ArtifactStore;tvs:TvDeviceRegistry;sessionForRequest(request:FastifyRequest):string|undefined}){
 app.addContentTypeParser('image/jpeg',{parseAs:'buffer',bodyLimit:MAX_SNAPSHOT_BYTES},(_request,body,done)=>done(null,body));
 let limiter:ReturnType<FastifyInstance['createRateLimit']>|undefined;
 const limit:import('fastify').preHandlerHookHandler=async(request,reply)=>{limiter??=app.createRateLimit({max:300,timeWindow:60_000,keyGenerator:()=> 'owner-test-runs'});const result=await limiter(request);if(!result.isAllowed&&result.isExceeded)return reply.header('retry-after',result.ttlInSeconds).code(429).send({code:'RATE_LIMITED',message:'Too many requests',requestId:request.id});};
 const token=(request:FastifyRequest)=>{const value=sessionForRequest(request);if(!value)throw new RunError('UNAUTHORIZED',401);return value;};
 const uuid=(value:string)=>{if(!testCaseIdSchema.safeParse(value).success)throw new RunError('BAD_REQUEST',400);return value;};
 app.register(async scoped=>{
  scoped.setErrorHandler((cause,request,reply)=>{
   if(cause instanceof RunError||cause instanceof RunConflictError||cause instanceof ArtifactError)return reply.code(cause instanceof ArtifactError&&cause.code==='INVALID_SNAPSHOT'?400:cause.statusCode).send({code:cause.code,message:cause.code,requestId:request.id});
   throw cause;
  });
  scoped.get<{Querystring:{limit?:string;before?:string;query?:string;status?:string;tvId?:string;since?:string;until?:string}}>('/api/test-runs',async request=>{
   const {limit:raw,before}=request.query;const count=raw===undefined?25:Number(raw);if(!Number.isInteger(count)||count<1||count>100)throw new RunError('BAD_REQUEST',400);
   let cursor:{time:number;id:string}|undefined;if(before){const [time,id,...extra]=before.split(':');if(!id||extra.length||!/^\d+$/.test(time??'')||!Number.isSafeInteger(Number(time)))throw new RunError('BAD_REQUEST',400);cursor={time:Number(time),id:uuid(id)};}
   const filters:import('./repository.js').RunHistoryFilters={};
   if(request.query.query!==undefined){if(request.query.query.length>200)throw new RunError('BAD_REQUEST',400);filters.query=request.query.query;}
   if(request.query.status){const parsed=testRunSchema.shape.status.safeParse(request.query.status);if(!parsed.success)throw new RunError('BAD_REQUEST',400);filters.status=parsed.data;}
   if(request.query.tvId)filters.tvId=uuid(request.query.tvId);
   for(const key of ['since','until'] as const){const value=request.query[key];if(value!==undefined){if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw new RunError('BAD_REQUEST',400);filters[key]=Number(value);}}
   return testRunsResponseSchema.parse(service.list(count,cursor,filters));
  });
  scoped.post('/api/test-runs',{preHandler:limit},async(request,reply)=>{
   const parsed=startTestRunSchema.safeParse(request.body);if(!parsed.success)throw new RunError('BAD_REQUEST',400);
   const owner=token(request);const existing=(()=>{try{return service.read(parsed.data.id);}catch(cause){if(cause instanceof RunError&&cause.statusCode===404)return undefined;throw cause;}})();
   if(existing)return testRunSchema.parse(service.start(parsed.data,owner,existing.platform,existing.tvName));
   const devices=await tvs.list();const device=devices.find(value=>value.tvId===parsed.data.tvId);if(!device)throw new RunError('TV_NOT_FOUND',404);
   return reply.code(201).send(testRunSchema.parse(service.start(parsed.data,owner,device.platform,device.status.tv?.identity.model??device.platform,device.status.tv?.identity.platformVersion)));
  });
  scoped.get<{Params:{id:string}}>('/api/test-runs/:id',async request=>testRunSchema.parse(service.read(uuid(request.params.id))));
  for(const action of ['advance','stop','heartbeat','failure'] as const)scoped.post<{Params:{id:string}}>(`/api/test-runs/:id/${action}`,{...(action==='advance'?{preHandler:limit}:{})},async request=>{
   const id=uuid(request.params.id),owner=token(request);
   if(action==='advance'){const body=request.body;if(typeof body!=='object'||!body||Object.keys(body).length!==1||!('itemId'in body)||typeof body.itemId!=='string')throw new RunError('BAD_REQUEST',400);return testRunSchema.parse(await service.advance(id,uuid(body.itemId),owner));}
   if(action==='failure'){const parsed=runFailureSchema.safeParse(request.body);if(!parsed.success)throw new RunError('BAD_REQUEST',400);return testRunSchema.parse(service.fail(id,owner,parsed.data));}
   if(request.body!==undefined&&(typeof request.body!=='object'||request.body===null||Object.keys(request.body).length))throw new RunError('BAD_REQUEST',400);
   return testRunSchema.parse(action==='stop'?service.stop(id,owner):service.heartbeat(id,owner));
  });
  scoped.put<{Params:{id:string;itemId:string}}>('/api/test-runs/:id/items/:itemId/snapshot',{bodyLimit:MAX_SNAPSHOT_BYTES,preHandler:limit},async request=>{
   const capturedAt=Number(request.headers['x-captured-at']);const camera=request.headers['x-camera-label'];
   if(!Number.isSafeInteger(capturedAt)||capturedAt<0||typeof camera!=='string'||camera.length>1200||!Buffer.isBuffer(request.body))throw new RunError('BAD_REQUEST',400);
   let cameraLabel:string;try{cameraLabel=decodeURIComponent(camera);}catch{throw new RunError('BAD_REQUEST',400);}if(cameraLabel.length>200)throw new RunError('BAD_REQUEST',400);
   return testRunSchema.parse(await service.saveSnapshot(uuid(request.params.id),uuid(request.params.itemId),token(request),request.body,{capturedAt,cameraLabel}));
  });
  scoped.get<{Params:{id:string;itemId:string}}>('/api/test-runs/:id/items/:itemId/snapshot',async(request,reply)=>{
   const id=uuid(request.params.id),itemId=uuid(request.params.itemId);if(!service.read(id).items.some(item=>item.id===itemId&&item.phase==='saved'))throw new RunError('SNAPSHOT_NOT_FOUND',404);
   return reply.header('x-content-type-options','nosniff').type('image/jpeg').send(await artifacts.read(id,itemId));
  });
 });
}
