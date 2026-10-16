import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createApiRuntime } from '../src/runtime.js';
import { openDatabase } from '../src/storage/database.js';
import { createOwnerRepository } from '../src/auth/repository.js';
import { createOwnerSetupService } from '../src/auth/service.js';
const origin = 'https://profile.example.test';
test('case API persists drafts and protects mutations', async () => {
 const dataDir=await mkdtemp(join(tmpdir(),'case-routes-'));
 const config={dataDir,host:'127.0.0.1',port:0,publicOrigin:origin,secureCookies:true,trustedProxy:[]};
 const db=await openDatabase({dataDir});
 const setup=createOwnerSetupService({repository:createOwnerRepository(db.sqlite)});
 const token=await setup.issueSetupToken(); await setup.claimOwner({token,username:'qa',password:'synthetic-password-only'}); db.close();
 const app=await createApiRuntime(config);
 try {
 expect((await app.inject('/api/test-cases')).statusCode).toBe(401);
 const login=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin},payload:{username:'qa',password:'synthetic-password-only'}});
 const cookie=String(login.headers['set-cookie']).split(';')[0]!;
 const session=(await app.inject({url:'/api/auth/session',headers:{cookie}})).json();
 const headers={cookie,origin,'x-csrf-token':session.csrfToken};
 const payload={id:'00000000-0000-4000-8000-000000000001',title:'Кейс',description:'',group:'',steps:[{id:'00000000-0000-4000-8000-000000000010',kind:'when',text:'Открыть каталог',actions:[{id:'00000000-0000-4000-8000-000000000020',action:'RIGHT',pauseAfterMs:500}]}]};
 for(const badHeaders of [{cookie,origin},{cookie,'x-csrf-token':session.csrfToken}]) expect((await app.inject({method:'POST',url:'/api/test-cases',headers:badHeaders,payload})).statusCode).toBe(403);
 expect((await app.inject({method:'POST',url:'/api/test-cases',headers,payload:{...payload,title:''}})).statusCode).toBe(400);
 expect((await app.inject({method:'POST',url:'/api/test-cases',headers,payload:{...payload,steps:[{...payload.steps[0],actions:[{...payload.steps[0]!.actions[0],pauseAfterMs:-1}]}]}})).statusCode).toBe(400);
 const saved=await app.inject({method:'POST',url:'/api/test-cases',headers,payload}); expect(saved.statusCode).toBe(201);
 expect((await app.inject({method:'POST',url:'/api/test-cases',headers,payload})).json()).toEqual(saved.json());
 expect((await app.inject({url:'/api/test-cases',headers})).json().cases).toHaveLength(1);
 const url='/api/test-cases/'+payload.id;
 expect((await app.inject({url,headers})).json()).toEqual(saved.json());
 const {id,...draft}=payload;
 expect((await app.inject({method:'PUT',url,headers,payload:{...draft,title:'Новый',version:1}})).json().version).toBe(2);
 expect((await app.inject({method:'PUT',url,headers,payload:{...draft,version:1}})).statusCode).toBe(409);
 expect((await app.inject({url:'/api/test-cases/00000000-0000-4000-8000-000000000002',headers})).statusCode).toBe(404);
 for(let i=0;i<20;i++) await app.inject({method:'POST',url:'/api/test-cases',headers,payload});
 expect((await app.inject({method:'POST',url:'/api/test-cases',headers,payload})).statusCode).toBe(429);
 await app.inject({method:'POST',url:'/api/auth/logout',headers});
 expect((await app.inject({url,headers})).statusCode).toBe(401);
 } finally {await app.close();await rm(dataDir,{recursive:true,force:true});}
});
test('storage errors and invalid stored responses fail safely without leaking case text',async()=>{
 const {buildApp}=await import('../src/app.js');const {Writable}=await import('node:stream');let logs='';
 const app=buildApp({config:{dataDir:'synthetic',host:'127.0.0.1',port:0,publicOrigin:origin,secureCookies:true,trustedProxy:[]},getSetupState:async()=>'claimed',logStream:new Writable({write(chunk,_encoding,done){logs+=String(chunk);done();}}),auth:{setup:{} as never,sessions:{authenticate:()=>({username:'qa',csrfToken:'synthetic'}),verifyCsrf:()=>true} as never},testCases:{list:()=>{throw new Error('private scenario text');},read:()=>({title:'private scenario text'} as never),create:()=>{throw new Error('private scenario text');},update:()=>{throw new Error('private scenario text');}}});
 try {for(const url of ['/api/test-cases','/api/test-cases/00000000-0000-4000-8000-000000000001']){const response=await app.inject({url,headers:{origin}});expect(response.statusCode).toBe(500);expect(response.body).not.toContain('private scenario');}expect(logs).not.toContain('private scenario');}finally{await app.close();}
});

test('accepts the documented maximum step/action counts rather than rejecting a valid body as too large',async()=>{
 const {buildApp}=await import('../src/app.js');
 const steps=Array.from({length:200},(_,index)=>({id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,kind:'when' as const,text:'Действие',actions:Array.from({length:200},(_,action)=>({id:`00000000-0000-4000-8000-${String(action+1).padStart(12,'0')}`,action:'RIGHT' as const,pauseAfterMs:500}))}));
 const payload={id:'00000000-0000-4000-8000-000000000001',title:'Большой кейс',description:'',group:'',steps};
 const app=buildApp({config:{dataDir:'synthetic',host:'127.0.0.1',port:0,publicOrigin:origin,secureCookies:true,trustedProxy:[]},getSetupState:async()=>'claimed',auth:{setup:{} as never,sessions:{authenticate:()=>({username:'qa',csrfToken:'synthetic'}),verifyCsrf:()=>true} as never},testCases:{list:()=>[],read:()=>undefined,create:input=>({...input,status:'draft',version:1,createdAt:1,updatedAt:1}),update:()=>{throw new Error('Unexpected update');}}});
 try {
 const result=await app.inject({method:'POST',url:'/api/test-cases',headers:{origin,'x-csrf-token':'synthetic'},payload});
 expect(result.statusCode).toBe(201);expect(result.json().steps[199].actions).toHaveLength(200);
 }finally{await app.close();}
});
