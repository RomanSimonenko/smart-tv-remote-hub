import {syntheticJpeg} from './support/synthetic-jpeg.js';
import Fastify from 'fastify';
import {test,expect,vi} from 'vitest';
import {registerOcrDiagnostics} from '../src/ocr/routes.js';
test('session revoked during admission never starts OCR',async()=>{
 const app=Fastify();let valid=true,release!:()=>void,entered!:()=>void;
 const admission=new Promise<void>(resolve=>{release=resolve;}),waiting=new Promise<void>(resolve=>{entered=resolve;});
 app.decorate('createRateLimit',()=>async()=>{entered();await admission;return{isAllowed:true as const,key:'synthetic'};});
 let revoke!:(token:string)=>void;
 const recognize=vi.fn(async()=>({blocks:[],engine:'synthetic',model:'synthetic'}));
 registerOcrDiagnostics(app,{recognize,close:async()=>{}},()=>valid?'owner':undefined,listener=>{revoke=listener;return()=>{};});
 try{
  const pending=app.inject({method:'POST',url:'/api/camera/ocr',headers:{'content-type':'image/jpeg'},payload:syntheticJpeg}).then(result=>result);
  await waiting;valid=false;revoke('owner');release();
  expect((await pending).statusCode).toBe(401);expect(recognize).not.toHaveBeenCalled();
 }finally{release();await app.close();}
});
