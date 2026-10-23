import type {FastifyInstance,FastifyRequest} from 'fastify';
import {storagePolicySchema,storageSummarySchema,retentionSelectionSchema,cleanupPreviewSchema,cleanupConfirmationSchema,cleanupResultSchema} from '@remote-webos-tv/contracts';
import {SettingsError,type StorageSettingsService} from './service.js';
import type {createDiagnostics} from './diagnostics.js';

export function registerSettingsRoutes(app:FastifyInstance,{storage,diagnostics,sessionForRequest}:{storage:StorageSettingsService;diagnostics:ReturnType<typeof createDiagnostics>;sessionForRequest(request:FastifyRequest):string|undefined}){
 let limiter:ReturnType<FastifyInstance['createRateLimit']>|undefined;
 app.register(async scoped=>{
  scoped.addHook('preHandler',async(request,reply)=>{
   limiter??=app.createRateLimit({max:60,timeWindow:60_000,keyGenerator:()=> 'owner-settings'});
   const result=await limiter(request);if(!result.isAllowed&&result.isExceeded)return reply.header('retry-after',result.ttlInSeconds).code(429).send({code:'RATE_LIMITED',message:'Too many requests',requestId:request.id});
  });
  scoped.setErrorHandler((cause,request,reply)=>{
   if(cause instanceof SettingsError)return reply.code(cause.statusCode).send({code:cause.code,message:cause.code,requestId:request.id});
   throw cause;
  });
  const bad=(request:FastifyRequest,reply:import('fastify').FastifyReply)=>reply.code(400).send({code:'BAD_REQUEST',message:'Bad request',requestId:request.id});
  const owner=(request:FastifyRequest)=>{const token=sessionForRequest(request);if(!token)throw new SettingsError('UNAUTHORIZED',401);return token;};
  scoped.get('/api/settings/storage',async()=>storageSummarySchema.parse(await storage.summary()));
  scoped.put('/api/settings/storage',async(request,reply)=>{const parsed=storagePolicySchema.safeParse(request.body);if(!parsed.success)return bad(request,reply);return storage.savePolicy(parsed.data);});
  scoped.post('/api/settings/storage/preview',async(request,reply)=>{const parsed=retentionSelectionSchema.safeParse(request.body);if(!parsed.success)return bad(request,reply);return cleanupPreviewSchema.parse(storage.preview(owner(request),parsed.data));});
  scoped.post('/api/settings/storage/cleanup',async(request,reply)=>{
   const parsed=cleanupConfirmationSchema.safeParse(request.body);if(!parsed.success)return bad(request,reply);
   return cleanupResultSchema.parse(await storage.confirm(owner(request),parsed.data.token,parsed.data.confirm));
  });
  scoped.get('/api/settings/diagnostics',diagnostics);
 });
}
