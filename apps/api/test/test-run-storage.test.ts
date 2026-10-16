import {expect,test} from 'vitest';
import Database from 'better-sqlite3';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTestRunRepository,testRunsTableSql} from '../src/test-runs/repository.js';
import {createArtifactStore} from '../src/test-runs/artifacts.js';
import {syntheticJpeg} from './support/synthetic-jpeg.js';
const id='00000000-0000-4000-8000-000000000001';
export const sampleRun={id,testCase:{id,title:'Synthetic',description:'',group:'',steps:[{id,kind:'given' as const,text:'Initial'}],version:1,status:'draft' as const,createdAt:1,updatedAt:1},tvId:id,platform:'webos' as const,tvName:'Synthetic TV',startedAt:100,status:'running' as const,items:[{id,stepId:id,ordinal:1,phase:'pending' as const}],revision:0};
test('run snapshot is immutable and transitions reject stale writers',()=>{
 const db=new Database(':memory:');db.exec(testRunsTableSql);try{const repo=createTestRunRepository(db);repo.create(sampleRun);
 sampleRun.testCase.title='Changed';expect(repo.read(id)?.testCase.title).toBe('Synthetic');sampleRun.testCase.title='Synthetic';
 repo.replace({...repo.read(id)!,status:'stopped',endedAt:110},0);
 expect(()=>repo.replace({...sampleRun,status:'error'},0)).toThrow();expect(repo.list(1).runs[0]?.status).toBe('stopped');
 }finally{db.close();}
});
test('history pages contain summaries and filters search older runs before pagination',()=>{
 const db=new Database(':memory:');db.exec(testRunsTableSql);try{const repo=createTestRunRepository(db);repo.create({...sampleRun,status:'stopped',startedAt:1});repo.create({...sampleRun,id:'00000000-0000-4000-8000-000000000002',startedAt:2});
 const page=repo.list(1,undefined,{status:'stopped',query:'synthetic'});expect(page.runs).toHaveLength(1);expect(page.runs[0]).toMatchObject({id,savedCount:0,itemCount:1,caseTitle:'Synthetic'});expect(page.runs[0]).not.toHaveProperty('items');expect(page.next).toBeNull();
 }finally{db.close();}
});
test('artifact storage rejects malformed data and enforces quota without partial files',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'run-files-'));try{
 const store=await createArtifactStore({dataDir,maxBytes:1});
 await expect(store.save(id,id,Buffer.from('invalid'))).rejects.toMatchObject({code:'INVALID_SNAPSHOT'});
 await expect(store.save(id,id,Buffer.from('ffd8ffc00008080001000100ffd9','hex'))).rejects.toMatchObject({code:'INVALID_SNAPSHOT'});
 const scan=syntheticJpeg.indexOf(Buffer.from([0xff,0xda]));const truncated=Buffer.concat([syntheticJpeg.subarray(0,scan),Buffer.from([0xff,0xd9])]);await expect(store.save(id,id,truncated)).rejects.toMatchObject({code:'INVALID_SNAPSHOT'});
 await expect(store.save(id,id,syntheticJpeg)).rejects.toMatchObject({code:'ARTIFACT_QUOTA_EXCEEDED'});
 }finally{await rm(dataDir,{recursive:true,force:true});}
});
test('artifact retries do not consume quota twice and committed files survive recovery',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'run-files-'));try{
 const store=await createArtifactStore({dataDir,maxBytes:syntheticJpeg.length});const first=await store.save(id,id,syntheticJpeg);expect(await store.save(id,id,syntheticJpeg)).toEqual(first);
 expect(await store.read(id,id)).toEqual(syntheticJpeg);
 await expect(store.save(id,'00000000-0000-4000-8000-000000000002',syntheticJpeg)).rejects.toMatchObject({code:'ARTIFACT_QUOTA_EXCEEDED'});
 const {testRunSchema}=await import('@remote-webos-tv/contracts');const run=testRunSchema.parse({...sampleRun,items:[{...sampleRun.items[0],phase:'saved',...first,capturedAt:100,savedAt:100,cameraLabel:'Synthetic'}]});expect((await store.recover([run])).size).toBe(0);
 }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('OS version survives document storage and history while legacy runs remain readable',()=>{
 const db=new Database(':memory:');db.exec(testRunsTableSql);
 try{
  const repo=createTestRunRepository(db);repo.create({...sampleRun,tvPlatformVersion:'6.5.3'});
  expect(repo.read(id)?.tvPlatformVersion).toBe('6.5.3');expect(repo.list().runs[0]?.tvPlatformVersion).toBe('6.5.3');
  const legacy={...sampleRun,id:'00000000-0000-4000-8000-000000000002'};repo.create(legacy);
  expect(repo.read(legacy.id)).not.toHaveProperty('tvPlatformVersion');expect(repo.list().runs.find(run=>run.id===legacy.id)).not.toHaveProperty('tvPlatformVersion');
 }finally{db.close();}
});

test('history accepts the canonical Unicode title limit without breaking the page',()=>{
 const db=new Database(':memory:');db.exec(testRunsTableSql);
 try{const repo=createTestRunRepository(db);const title='😀'.repeat(200);repo.create({...sampleRun,testCase:{...sampleRun.testCase,title}});expect(repo.list().runs[0]?.caseTitle).toBe(title);}finally{db.close();}
});
