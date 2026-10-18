import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {expect,test} from 'vitest';
import {randomUUID} from 'node:crypto';
import {ControlledAdapter,pairing,snapshot,drain} from './support/tv-harness.js';
import {syntheticJpeg} from './support/synthetic-jpeg.js';
import {createApiRuntime} from '../src/runtime.js';import {openDatabase} from '../src/storage/database.js';import {createOwnerRepository} from '../src/auth/repository.js';import {createOwnerSetupService} from '../src/auth/service.js';
test('run history and artifacts require authentication and mutations require CSRF',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'run-api-'));const origin='https://runner.example.test';
 const db=await openDatabase({dataDir});const setup=createOwnerSetupService({repository:createOwnerRepository(db.sqlite)});const token=await setup.issueSetupToken();await setup.claimOwner({token,username:'qa',password:'synthetic-password-only'});db.close();
 const app=await createApiRuntime({dataDir,host:'127.0.0.1',port:0,publicOrigin:origin,secureCookies:true,trustedProxy:[]});
 try{
 expect((await app.inject('/api/test-runs')).statusCode).toBe(401);
 const login=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin},payload:{username:'qa',password:'synthetic-password-only'}});const cookie=String(login.headers['set-cookie']).split(';')[0]!;
 const session=(await app.inject({url:'/api/auth/session',headers:{cookie}})).json();const headers={cookie,origin,'x-csrf-token':session.csrfToken};
 expect((await app.inject({url:'/api/test-runs',headers})).json()).toEqual({runs:[],next:null});
 expect((await app.inject({method:'POST',url:'/api/test-runs',headers:{cookie,origin},payload:{}})).statusCode).toBe(403);
 expect((await app.inject({method:'POST',url:'/api/test-runs',headers,payload:{}})).statusCode).toBe(400);
 expect((await app.inject({url:'/api/test-runs?limit=101',headers})).statusCode).toBe(400);
 expect((await app.inject({url:'/api/test-runs/00000000-0000-4000-8000-000000000001/items/00000000-0000-4000-8000-000000000002/snapshot',headers})).statusCode).toBe(404);
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
test('authenticated API executes and stores five frames, locks manual paths and serves protected evidence',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'run-api-full-'));const origin='https://runner.example.test';const db=await openDatabase({dataDir});const setup=createOwnerSetupService({repository:createOwnerRepository(db.sqlite)});const token=await setup.issueSetupToken();await setup.claimOwner({token,username:'qa',password:'synthetic-password-only'});db.close();
 const sent:string[]=[];
 const app=await createApiRuntime({dataDir,host:'127.0.0.1',port:0,publicOrigin:origin,secureCookies:true,trustedProxy:[]},{createAdapter:(_host,staging)=>new class extends ControlledAdapter{
  override async pair(){await staging.save('synthetic-key');return pairing;}
  override async readSnapshot(){return snapshot;}
  override async sendButton(button:Parameters<ControlledAdapter['sendButton']>[0]){sent.push(button);}
 }(staging)});
 try{
 const login=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin},payload:{username:'qa',password:'synthetic-password-only'}});const cookie=String(login.headers['set-cookie']).split(';')[0]!;const session=(await app.inject({url:'/api/auth/session',headers:{cookie}})).json();const headers={cookie,origin,'x-csrf-token':session.csrfToken};
 const device=await app.inject({method:'POST',url:'/api/tvs',headers,payload:{id:randomUUID(),host:'192.168.1.10',platform:'webos'}});expect(device.statusCode).toBe(202);const tvId=device.json().tvId;await drain();
 const caseId=randomUUID();const steps=(['given','when','then','when','then'] as const).map((kind,index)=>({id:randomUUID(),kind,text:`Synthetic ${index+1}`,...(kind==='when'?{actions:[{id:randomUUID(),action:index===1?'RIGHT':'LEFT',pauseAfterMs:0}]}:{})}));
 expect((await app.inject({method:'POST',url:'/api/test-cases',headers,payload:{id:caseId,title:'Synthetic five frames',description:'',group:'',steps}})).statusCode).toBe(201);
 const id=randomUUID(),input={id,caseId,version:1,tvId};let response=await app.inject({method:'POST',url:'/api/test-runs',headers,payload:input});expect(response.statusCode).toBe(201);let run=response.json();expect(run.items).toHaveLength(5);
 const emptyHeartbeat=await app.inject({method:'POST',url:`/api/test-runs/${id}/heartbeat`,headers:{...headers,'content-type':'application/json'}});expect(emptyHeartbeat.statusCode).toBe(400);
 const heartbeat=await app.inject({method:'POST',url:`/api/test-runs/${id}/heartbeat`,headers:{...headers,'content-type':'application/json'},payload:'{}'});expect(heartbeat.statusCode).toBe(200);expect(heartbeat.json().status).toBe('running');
 expect((await app.inject({method:'POST',url:'/api/test-runs',headers,payload:input})).json().id).toBe(id);
 expect((await app.inject({method:'POST',url:`/api/tvs/${tvId}/commands`,headers,payload:{id:randomUUID(),button:'RIGHT'}})).statusCode).toBe(409);
 expect((await app.inject({method:'DELETE',url:`/api/tvs/${tvId}`,headers,payload:{confirm:true}})).statusCode).toBe(409);
 for(const item of run.items){response=await app.inject({method:'POST',url:`/api/test-runs/${id}/advance`,headers,payload:{itemId:item.id}});expect(response.statusCode).toBe(200);
 response=await app.inject({method:'PUT',url:`/api/test-runs/${id}/items/${item.id}/snapshot`,headers:{...headers,'content-type':'image/jpeg','x-captured-at':String(Date.now()),'x-camera-label':'Synthetic'},payload:syntheticJpeg});expect(response.statusCode).toBe(200);run=response.json();}
 expect(run.status).toBe('needs_review');expect(sent).toEqual(['RIGHT','LEFT']);
 const imageUrl=`/api/test-runs/${id}/items/${run.items[0].id}/snapshot`;expect((await app.inject(imageUrl)).statusCode).toBe(401);const image=await app.inject({url:imageUrl,headers});expect(image.headers['content-type']).toContain('image/jpeg');expect(image.rawPayload).toEqual(syntheticJpeg);
 expect((await app.inject({url:'/api/test-runs',headers})).json().runs[0].id).toBe(id);
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
