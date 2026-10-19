import {syntheticJpeg} from './support/synthetic-jpeg.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test,expect,vi} from 'vitest';
import {createApiRuntime} from '../src/runtime.js';
import {openDatabase} from '../src/storage/database.js';
import {createOwnerRepository} from '../src/auth/repository.js';
import {createOwnerSetupService} from '../src/auth/service.js';
import {OcrError} from '../src/ocr/recognizer.js';
test('OCR diagnostics require session and CSRF, share recognizer and never create runs',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'ocr-settings-')),origin='https://ocr.example.test';
 const db=await openDatabase({dataDir}),setup=createOwnerSetupService({repository:createOwnerRepository(db.sqlite)});
 const token=await setup.issueSetupToken();await setup.claimOwner({token,username:'qa',password:'synthetic-password-only'});db.close();
 const recognize=vi.fn(async(_image:Buffer,_signal:AbortSignal)=>({blocks:[{text:'Settings'}],engine:'synthetic',model:'synthetic'}));
 const app=await createApiRuntime({dataDir,host:'127.0.0.1',port:0,publicOrigin:origin,secureCookies:true,trustedProxy:[]},{ocrRecognizer:{recognize,close:async()=>{}}});
 try{
  const input={method:'POST' as const,url:'/api/camera/ocr',headers:{origin,'content-type':'image/jpeg'},payload:syntheticJpeg};
  expect((await app.inject(input)).statusCode).toBe(401);
  const login=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin},payload:{username:'qa',password:'synthetic-password-only'}});
  const cookie=String(login.headers['set-cookie']).split(';')[0]!,session=(await app.inject({url:'/api/auth/session',headers:{cookie}})).json();
  expect((await app.inject({...input,headers:{...input.headers,cookie}})).statusCode).toBe(403);
  const headers={...input.headers,cookie,'x-csrf-token':session.csrfToken};
  expect((await app.inject({...input,headers:{...headers,origin:'https://other.example.test'}})).statusCode).toBe(403);
  for(const offset of [5,7]){
   const oversized=Buffer.from(syntheticJpeg);const marker=oversized.indexOf(Buffer.from([0xff,0xc0]));oversized.writeUInt16BE(4097,marker+offset);
   expect((await app.inject({...input,headers,payload:oversized})).statusCode).toBe(400);
  }
  expect((await app.inject({...input,headers,payload:Buffer.from('invalid JPEG')})).statusCode).toBe(400);
  expect(recognize).not.toHaveBeenCalled();
  const response=await app.inject({...input,headers});expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({blocks:[{text:'Settings'}],engine:'synthetic',model:'synthetic',elapsedMs:expect.any(Number)});
  expect(recognize).toHaveBeenCalledWith(input.payload,expect.any(AbortSignal));
  expect((await app.inject({url:'/api/test-runs',headers:{cookie}})).json().runs).toEqual([]);
  expect((await app.inject({...input,headers,payload:Buffer.alloc(5*1024*1024+1)})).statusCode).toBe(413);
  recognize.mockRejectedValueOnce(new OcrError('OCR_BUSY','busy'));expect((await app.inject({...input,headers})).statusCode).toBe(429);
  recognize.mockRejectedValueOnce(new OcrError('OCR_TIMEOUT','timeout'));expect((await app.inject({...input,headers})).statusCode).toBe(504);
  let signal:AbortSignal|undefined;recognize.mockImplementationOnce(async(_image:Buffer,abort:AbortSignal)=>new Promise((_,reject)=>{signal=abort;abort!.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});}));
  const pending=app.inject({...input,headers});await vi.waitFor(()=>expect(signal).toBeDefined());
  await app.inject({method:'POST',url:'/api/auth/logout',headers});expect((await pending).statusCode).toBe(401);expect(signal!.aborted).toBe(true);
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
