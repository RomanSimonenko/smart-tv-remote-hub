import {expect,test} from 'vitest';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../src/storage/database.js';
import {createArtifactStore} from '../src/test-runs/artifacts.js';
import {createTestRunRepository} from '../src/test-runs/repository.js';
import {createStorageSettingsService} from '../src/settings/service.js';
import {syntheticJpeg} from './support/synthetic-jpeg.js';

const day=86_400_000;
async function fixture(run:(f:Awaited<ReturnType<typeof setup>>)=>Promise<void>){
 const f=await setup();try{await run(f);}finally{f.db.close();await rm(f.dataDir,{recursive:true,force:true});}
}
async function setup(){
 const dataDir=await mkdtemp(join(tmpdir(),'settings-storage-')),db=await openDatabase({dataDir});
 const artifacts=await createArtifactStore({dataDir,maxBytes:syntheticJpeg.length*10}),repository=createTestRunRepository(db.sqlite);
 let time=100*day;
 const service=createStorageSettingsService({sqlite:db.sqlite,artifacts,dataDir,now:()=>time});
 async function add(status:'passed'|'failed'|'running'|'needs_review'='passed',age=40,settling=false){
  const id=randomUUID(),itemId=randomUUID(),stored=await artifacts.save(id,itemId,syntheticJpeg);
  repository.create({id,testCase:{id,title:'Synthetic case',description:'',group:'',steps:[{id,kind:'given',text:'Initial'}],version:1,status:'draft',createdAt:1,updatedAt:1},tvId:id,platform:'webos',tvName:'Synthetic TV',startedAt:time-age*day,status,settling,...(status==='running'?{}:{endedAt:time-age*day}),items:[{id:itemId,stepId:id,ordinal:1,phase:'saved',...stored,capturedAt:1,savedAt:1,cameraLabel:'Synthetic'}],revision:0});return {id,itemId};
 }
 return {dataDir,db,artifacts,repository,service,add,advance:()=>{time+=11*60_000;}};
}
test('safe default never deletes; previews exclude active, settling, recent and preserved unsuccessful runs',()=>fixture(async f=>{
 const old=await f.add();await f.add('running');await f.add('passed',40,true);await f.add('passed',30);await f.add('failed');await f.add('needs_review');
 expect(f.service.policy()).toEqual({automatic:false,days:30,keepUnsuccessful:true});
 await f.service.sweep();expect(f.repository.read(old.id)).toBeDefined();
 const preview=f.service.preview('session', {days:30,keepUnsuccessful:true});
 expect(preview.candidates.map(r=>r.id)).toEqual([old.id]);expect(preview.snapshotBytes).toBe(syntheticJpeg.length);
 await expect(f.service.confirm('session',preview.token,false)).rejects.toMatchObject({code:'BAD_REQUEST'});
 await expect(f.service.confirm('another',preview.token,true)).rejects.toMatchObject({code:'CLEANUP_PREVIEW_EXPIRED'});
 const original=f.repository.read(old.id)!;expect(original).toBeDefined();
 expect(await f.service.confirm('session',preview.token,true)).toMatchObject({deleted:1,pendingFiles:0});
 expect(f.repository.read(old.id)).toBeUndefined();await expect(f.artifacts.read(old.id,old.itemId)).rejects.toMatchObject({code:'ENOENT'});
 expect(await f.service.confirm('session',preview.token,true)).toMatchObject({deleted:1});
 expect(()=>f.repository.create(original)).toThrow(/deleted/);
}));
test('preview expires and changed revisions require a new preview without partial deletion',()=>fixture(async f=>{
 const a=await f.add(),b=await f.add();const preview=f.service.preview('s',{days:30,keepUnsuccessful:false});
 f.repository.replace({...f.repository.read(b.id)!,status:'failed'},0);
 await expect(f.service.confirm('s',preview.token,true)).rejects.toMatchObject({code:'CLEANUP_PREVIEW_STALE'});expect(f.repository.read(a.id)).toBeDefined();
 const expired=f.service.preview('s',{days:30,keepUnsuccessful:false});f.advance();
 await expect(f.service.confirm('s',expired.token,true)).rejects.toMatchObject({code:'CLEANUP_PREVIEW_EXPIRED'});
}));
test('policy persists, automatic sweep removes eligible runs and releases quota',()=>fixture(async f=>{
 const old=await f.add();const policy={automatic:true,days:30,keepUnsuccessful:false};f.service.savePolicy(policy);
 const service=createStorageSettingsService({sqlite:f.db.sqlite,artifacts:f.artifacts,dataDir:f.dataDir,now:()=>100*day});expect(service.policy()).toEqual(policy);
 await service.sweep();expect(f.repository.read(old.id)).toBeUndefined();
 expect((await service.summary()).snapshots.bytes).toBe(0);
 await f.add();expect((await service.summary()).snapshots.bytes).toBe(syntheticJpeg.length);
}));
test('durable cleanup retries after file failure and does not restore deleted reports',()=>fixture(async f=>{
 const old=await f.add();let fail=true;
 const service=createStorageSettingsService({sqlite:f.db.sqlite,dataDir:f.dataDir,now:()=>100*day,artifacts:{...f.artifacts,async removeRun(id:string){if(fail)throw new Error('Synthetic disk failure');return f.artifacts.removeRun(id);}}});
 const p=service.preview('s',{days:30,keepUnsuccessful:false});expect(await service.confirm('s',p.token,true)).toMatchObject({deleted:1,pendingFiles:1});expect(f.repository.read(old.id)).toBeUndefined();
 fail=false;await service.sweep();expect((await service.summary()).pendingFiles).toBe(0);
 await expect(f.artifacts.read(old.id,old.itemId)).rejects.toMatchObject({code:'ENOENT'});
}));
test('summary measures actual files and excludes downloaded videos; invalid policies are rejected',()=>fixture(async f=>{
 await f.add();await writeFile(join(f.dataDir,'synthetic.bin'),Buffer.alloc(12));
 const summary=await f.service.summary();expect(summary.reports.count).toBe(1);expect(summary.snapshots).toMatchObject({count:1,bytes:syntheticJpeg.length});expect(summary.otherBytes).toBeGreaterThanOrEqual(12);expect(summary.databaseBytes).toBeGreaterThan(0);expect(summary.freeBytes).toBeGreaterThan(0);
 for(const days of [0,-1,1.2,3651])expect(()=>f.service.savePolicy({automatic:true,days,keepUnsuccessful:true})).toThrow();
}));
