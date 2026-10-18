import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
import {test,expect} from 'vitest';
import {createApiRuntime} from '../src/runtime.js';import {openDatabase} from '../src/storage/database.js';import {createOwnerRepository} from '../src/auth/repository.js';import {createOwnerSetupService} from '../src/auth/service.js';
const sharp=createRequire(createRequire(import.meta.url).resolve('@remote-webos-tv/screen-vision'))('sharp');
test('camera preview uses authenticated CSRF-protected bounded worker processing',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'camera-route-')),origin='https://camera.example.test';
 const db=await openDatabase({dataDir}),setup=createOwnerSetupService({repository:createOwnerRepository(db.sqlite)});
 const token=await setup.issueSetupToken();await setup.claimOwner({token,username:'qa',password:'synthetic-password-only'});db.close();
 const app=await createApiRuntime({dataDir,host:'127.0.0.1',port:0,publicOrigin:origin,secureCookies:true,trustedProxy:[]});
 const blank=await sharp({create:{width:640,height:480,channels:3,background:'black'}}).png().toBuffer();
 try{
  expect((await app.inject({method:'POST',url:'/api/camera/preview',headers:{origin,'content-type':'image/png'},payload:blank})).statusCode).toBe(401);
  const login=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin},payload:{username:'qa',password:'synthetic-password-only'}});
  const cookie=String(login.headers['set-cookie']).split(';')[0]!,session=(await app.inject({url:'/api/auth/session',headers:{cookie}})).json();
  const headers={origin,cookie,'x-csrf-token':session.csrfToken,'content-type':'image/png'};
  expect((await app.inject({method:'POST',url:'/api/camera/preview',headers:{origin,cookie,'content-type':'image/png'},payload:blank})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:'/api/camera/preview',headers:{...headers,origin:'https://wrong.example.test'},payload:blank})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:'/api/camera/preview',headers:{...headers,'x-screen-prior':'{}'},payload:blank})).statusCode).toBe(400);
  expect((await app.inject({method:'POST',url:'/api/camera/preview',headers,payload:Buffer.alloc(4*1024*1024+1)})).statusCode).toBe(413);
  expect((await app.inject({method:'POST',url:'/api/camera/preview',headers,payload:Buffer.from('invalid')})).statusCode).toBe(422);
  const missing=await app.inject({method:'POST',url:'/api/camera/preview',headers,payload:blank});expect(missing.statusCode).toBe(200);expect(missing.json()).toEqual({status:'not-found'});
  const image=await sharp(Buffer.from('<svg width="640" height="480"><rect width="640" height="480" fill="#202020"/><rect x="100" y="100" width="440" height="250" fill="white"/></svg>')).png().toBuffer();
  const found=await app.inject({method:'POST',url:'/api/camera/preview',headers,payload:image});expect(found.statusCode).toBe(200);expect(found.json().status).toBe('found');expect((await sharp(Buffer.from(found.json().image,'base64')).metadata()).width).toBe(960);
  expect((await app.inject({method:'POST',url:'/api/camera/preview',headers:{...headers,'x-screen-prior':JSON.stringify(found.json().prior)},payload:blank})).json()).toEqual({status:'not-found'});
  const high=await sharp(image).resize(1920,1440).png().toBuffer();
  const snapshotHeaders={...headers,'x-screen-prior':JSON.stringify(found.json().prior)};
  expect((await app.inject({method:'POST',url:'/api/camera/snapshot',headers:{origin,'content-type':'image/png'},payload:high})).statusCode).toBe(401);
  expect((await app.inject({method:'POST',url:'/api/camera/snapshot',headers:{...snapshotHeaders,'x-csrf-token':''},payload:high})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:'/api/camera/snapshot',headers,payload:high})).statusCode).toBe(400);
  const snapshot=await app.inject({method:'POST',url:'/api/camera/snapshot',headers:snapshotHeaders,payload:high});
  expect(snapshot.statusCode).toBe(200);expect(snapshot.json().status).toBe('found');
  const meta=await sharp(Buffer.from(snapshot.json().image,'base64')).metadata();expect(meta.format).toBe('jpeg');expect(meta.width).toBeGreaterThan(1250);expect(meta.width).toBeLessThan(1340);
  expect((await app.inject({method:'POST',url:'/api/camera/snapshot',headers:snapshotHeaders,payload:blank})).json()).toEqual({status:'not-found'});
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
},20000);
