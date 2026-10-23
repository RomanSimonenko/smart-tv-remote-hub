import {expect,test} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createApiRuntime} from '../src/runtime.js';import {openDatabase} from '../src/storage/database.js';
import {createOwnerRepository} from '../src/auth/repository.js';import {createOwnerSetupService} from '../src/auth/service.js';
import {createOcrRecognizer} from '../src/ocr/recognizer.js';
import {createDiagnostics} from '../src/settings/diagnostics.js';
import {createStorageSettingsService} from '../src/settings/service.js';
import {createArtifactStore} from '../src/test-runs/artifacts.js';
test('settings routes enforce sessions and CSRF, validate policy and preview confirmation, return safe diagnostics',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'settings-api-')),origin='https://synthetic.example.test';
 const db=await openDatabase({dataDir});const setup=createOwnerSetupService({repository:createOwnerRepository(db.sqlite)});
 await setup.claimOwner({token:await setup.issueSetupToken(),username:'qa',password:'synthetic-password-only'});db.close();
 const app=await createApiRuntime({dataDir,host:'127.0.0.1',port:0,publicOrigin:origin,secureCookies:true,trustedProxy:[]});
 try{
  for(const url of ['/api/settings/storage','/api/settings/diagnostics'])expect((await app.inject(url)).statusCode).toBe(401);
  const login=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin},payload:{username:'qa',password:'synthetic-password-only'}});
  const cookie=String(login.headers['set-cookie']).split(';')[0]!;
  const session=(await app.inject({url:'/api/auth/session',headers:{cookie}})).json();const headers={cookie,origin,'x-csrf-token':session.csrfToken};
  const summary=await app.inject({url:'/api/settings/storage',headers});expect(summary.statusCode).toBe(200);expect(summary.json().policy.automatic).toBe(false);
  const payload={automatic:true,days:90,keepUnsuccessful:true};
  expect((await app.inject({method:'PUT',url:'/api/settings/storage',headers:{cookie,origin},payload})).statusCode).toBe(403);
  expect((await app.inject({method:'PUT',url:'/api/settings/storage',headers,payload:{...payload,days:0}})).statusCode).toBe(400);
  expect((await app.inject({method:'PUT',url:'/api/settings/storage',headers,payload})).json()).toEqual(payload);
  const preview=await app.inject({method:'POST',url:'/api/settings/storage/preview',headers,payload:{days:30,keepUnsuccessful:true}});expect(preview.statusCode).toBe(200);
  expect((await app.inject({method:'POST',url:'/api/settings/storage/cleanup',headers,payload:{token:preview.json().token}})).statusCode).toBe(400);
  expect((await app.inject({method:'POST',url:'/api/settings/storage/cleanup',headers,payload:{token:preview.json().token,confirm:true}})).json()).toEqual({deleted:0,pendingFiles:0});
  const response=await app.inject({url:'/api/settings/diagnostics',headers});expect(response.statusCode).toBe(200);const diagnostics=response.json();
  expect(diagnostics.checks).toEqual({api:'ok',database:'ok',storage:'ok'});expect(diagnostics.ocr.state).toBe('stopped');expect(diagnostics.sqliteVersion).toMatch(/^\d+\./);
  const text=JSON.stringify(diagnostics);for(const secret of [dataDir,'qa','password','token','host','Synthetic TV'])expect(text).not.toContain(secret);
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
test('OCR reports stopped and closed state without starting a worker',async()=>{
 let spawns=0;const ocr=createOcrRecognizer({spawn:()=>{spawns++;throw new Error('Synthetic');}});
 expect(ocr.status?.()).toEqual({state:'stopped',engine:null,model:null});expect(spawns).toBe(0);
 await expect(ocr.recognize(Buffer.alloc(0),new AbortController().signal)).rejects.toThrow();
 expect(ocr.status?.().state).toBe('failed');await ocr.close();expect(ocr.status?.().state).toBe('stopped');
});
test('diagnostics reports a broken database instead of losing all diagnostic results',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'settings-broken-db-')),db=await openDatabase({dataDir});
 const ocr=createOcrRecognizer(),artifacts=await createArtifactStore({dataDir}),storage=createStorageSettingsService({sqlite:db.sqlite,artifacts,dataDir});
 const diagnose=createDiagnostics({sqlite:db.sqlite,storage,ocr,dataDir});db.close();
 try{const value=await diagnose();expect(value.checks.database).toBe('error');expect(value.checks.storage).toBe('ok');expect(value.cleanup.pendingFiles).toBeNull();}
 finally{await ocr.close();await rm(dataDir,{recursive:true,force:true});}
});
