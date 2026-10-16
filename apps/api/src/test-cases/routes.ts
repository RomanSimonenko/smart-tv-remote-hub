import type { FastifyInstance } from 'fastify';
import { testCaseIdSchema, createTestCaseSchema, updateTestCaseSchema, testCaseSchema, testCasesResponseSchema } from '@remote-webos-tv/contracts';
import { TestCaseConflictError, TestCaseNotFoundError, TestCaseValidationError, type TestCaseRepository } from './repository.js';
export function registerTestCaseRoutes(app: FastifyInstance, repository: TestCaseRepository): void {
 // Covers 200 steps × 200 key actions plus maximum UTF-8 descriptions.
 const bodyLimit=8*1024*1024;
 let limiter: ReturnType<FastifyInstance['createRateLimit']> | undefined;
 const limitMutation: import('fastify').preHandlerHookHandler = async (request,reply)=> {
  limiter ??= app.createRateLimit({max:20,timeWindow:60_000,keyGenerator:()=> 'owner-test-cases'});
  const limit=await limiter(request);
  if(!limit.isAllowed && limit.isExceeded) return reply.header('retry-after',limit.ttlInSeconds).code(429).send({code:'RATE_LIMITED',message:'Too many requests',requestId:request.id});
 };
 app.get('/api/test-cases',async()=>testCasesResponseSchema.parse({cases:repository.list()}));
 app.get<{Params:{id:string}}>('/api/test-cases/:id',async(request,reply)=> {
  if(!testCaseIdSchema.safeParse(request.params.id).success) return reply.code(400).send({code:'BAD_REQUEST',message:'Bad request',requestId:request.id});
  const value=repository.read(request.params.id);
  if(!value) return reply.code(404).send({code:'NOT_FOUND',message:'Not found',requestId:request.id});
  return testCaseSchema.parse(value);
 });
 app.post('/api/test-cases',{bodyLimit,preHandler:limitMutation},async(request,reply)=> {
  const input=createTestCaseSchema.safeParse(request.body);
  if(!input.success) return reply.code(400).send({code:'BAD_REQUEST',message:'Bad request',requestId:request.id});
  try {return reply.code(201).send(testCaseSchema.parse(repository.create(input.data)));}
  catch(cause) {if(cause instanceof TestCaseConflictError) return reply.code(409).send({code:'VERSION_CONFLICT',message:'Version conflict',requestId:request.id});throw cause;}
 });
 app.put<{Params:{id:string}}>('/api/test-cases/:id',{bodyLimit,preHandler:limitMutation},async(request,reply)=> {
  const input=updateTestCaseSchema.safeParse(request.body);
  if(!input.success || !testCaseIdSchema.safeParse(request.params.id).success) return reply.code(400).send({code:'BAD_REQUEST',message:'Bad request',requestId:request.id});
  try {return testCaseSchema.parse(repository.update(request.params.id,input.data));}
  catch(cause) {
   if(cause instanceof TestCaseValidationError)return reply.code(400).send({code:'BAD_REQUEST',message:cause.message,requestId:request.id});
   if(cause instanceof TestCaseConflictError) return reply.code(409).send({code:'VERSION_CONFLICT',message:'Version conflict',requestId:request.id});
   if(cause instanceof TestCaseNotFoundError) return reply.code(404).send({code:'NOT_FOUND',message:'Not found',requestId:request.id});
   throw cause;
  }
 });
}
