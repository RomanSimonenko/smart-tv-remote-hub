import {EventEmitter} from 'node:events';import {request} from 'node:http';import type {Worker} from 'node:worker_threads';
import Fastify from 'fastify';import rateLimit from '@fastify/rate-limit';import {test,expect} from 'vitest';
import {registerCameraRoutes} from '../src/camera/routes.js';
test('disconnect after worker dispatch terminates processing and releases admission',async()=>{
 let dispatchedResolve!:()=>void,terminatedResolve!:()=>void;
 const dispatched={promise:new Promise<void>(resolve=>{dispatchedResolve=resolve;}),resolve:()=>dispatchedResolve()};
 const terminated={promise:new Promise<void>(resolve=>{terminatedResolve=resolve;}),resolve:()=>terminatedResolve()};let count=0;
 const workers:FakeWorker[]=[];
 class FakeWorker extends EventEmitter{
  constructor(readonly hold:boolean){super();workers.push(this);}
  postMessage(){if(this.hold)dispatched.resolve();else queueMicrotask(()=>this.emit('message',{status:'not-found'}));}
  async terminate(){terminated.resolve();queueMicrotask(()=>this.emit('exit',0));return 0;}
 }
 const app=Fastify();await app.register(rateLimit,{global:false});
 registerCameraRoutes(app,()=> 'synthetic-owner',()=>new FakeWorker(count++===0) as unknown as Worker);
 const url=await app.listen({host:'127.0.0.1',port:0});
 try{
  const req=request(url+'/api/camera/preview',{method:'POST',headers:{'content-type':'image/png'}},response=>response.resume());req.on('error',()=>{});req.end(Buffer.from('synthetic'));
  await dispatched.promise;req.destroy();await terminated.promise;
  const next=await app.inject({method:'POST',url:'/api/camera/preview',headers:{'content-type':'image/png'},payload:Buffer.from('synthetic')});
  expect(next.statusCode).toBe(200);expect(next.json()).toEqual({status:'not-found'});expect(count).toBe(2);
  workers[0]!.emit('error',new Error('Synthetic late worker failure'));
  expect((await app.inject({method:'POST',url:'/api/camera/preview',headers:{'content-type':'image/png'},payload:Buffer.from('synthetic')})).statusCode).toBe(200);
  expect(count).toBe(2);
 }finally{await app.close();}
});
