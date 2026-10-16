import {expect,test,vi} from 'vitest';
import Database from 'better-sqlite3';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createTestRunRepository,testRunsTableSql} from '../src/test-runs/repository.js';
import {createArtifactStore} from '../src/test-runs/artifacts.js';
import {createTestRunService} from '../src/test-runs/service.js';
import {harness,succeed,drain,barrier} from './support/tv-harness.js';
import {syntheticJpeg} from './support/synthetic-jpeg.js';
test('commands advance once and wait for evidence; stop preserves delivered outcome',async()=>{
 const db=new Database(':memory:');db.exec(testRunsTableSql);const dataDir=await mkdtemp(join(tmpdir(),'runner-service-'));
 const {service:tv,adapters,scheduler}=harness();tv.start({action:'pair',host:'192.168.1.10'});await drain();await succeed(adapters[0]!);
 const id=randomUUID(),stepId=randomUUID();
 const scenario={id,title:'Synthetic',description:'',group:'',steps:[{id:stepId,kind:'when' as const,text:'Move',actions:[{id:randomUUID(),action:'RIGHT' as const,pauseAfterMs:500}]}],status:'draft' as const,version:1,createdAt:0,updatedAt:0};
 const runner=createTestRunService({repository:createTestRunRepository(db),artifacts:await createArtifactStore({dataDir}),readCase:()=>scenario,resolveTv:()=>tv,now:()=>scheduler.now(),scheduler,newId:randomUUID});
 try{
 const run=runner.start({id:randomUUID(),caseId:id,version:1,tvId:randomUUID()},'session','webos','Synthetic TV','6.5.3');
 expect(runner.read(run.id).tvPlatformVersion).toBe('6.5.3');
 const item=run.items[0]!;const sent=await runner.advance(run.id,item.id,'session');
 expect(sent.items[0]?.delivery?.outcome).toBe('sent');expect(sent.items[0]?.captureNotBefore).toBe(500);
 await runner.advance(run.id,item.id,'session');expect(adapters[0]?.sent).toEqual(['RIGHT']);
 expect(()=>runner.start({id:randomUUID(),caseId:id,version:1,tvId:run.tvId},'other','webos','TV')).toThrow();
 const stopped=runner.stop(run.id,'session');expect(stopped.status).toBe('stopped');expect(stopped.items[0]?.delivery?.outcome).toBe('sent');expect(tv.remoteState().enabled).toBe(true);
 }finally{await runner.close();await tv.close();db.close();await rm(dataDir,{recursive:true,force:true});}
});
test('five ordered snapshots complete as needs_review, upload retries are idempotent and pauses enforced',async()=>{
 const db=new Database(':memory:');db.exec(testRunsTableSql);const dataDir=await mkdtemp(join(tmpdir(),'runner-five-'));
 const {service:tv,adapters,scheduler}=harness();tv.start({action:'pair',host:'192.168.1.10'});await drain();await succeed(adapters[0]!);
 const id=randomUUID();const steps=(['given','when','then','when','then'] as const).map((kind,index)=>({id:randomUUID(),kind,text:`Synthetic ${index+1}`,...(kind==='when'?{actions:[{id:randomUUID(),action:index===1?'RIGHT' as const:'LEFT' as const,pauseAfterMs:500}]}:{})}));
 const scenario={id,title:'Synthetic',description:'',group:'',steps,status:'draft' as const,version:1,createdAt:0,updatedAt:0};
 const repo=createTestRunRepository(db),store=await createArtifactStore({dataDir});const runner=createTestRunService({repository:repo,artifacts:store,readCase:()=>scenario,resolveTv:()=>tv,now:()=>scheduler.now(),scheduler});
 try{let run=runner.start({id:randomUUID(),caseId:id,version:1,tvId:randomUUID()},'session','webos','TV');
 for(const item of run.items){await runner.advance(run.id,item.id,'session');if(item.action){await expect(runner.saveSnapshot(run.id,item.id,'session',syntheticJpeg,{capturedAt:scheduler.now(),cameraLabel:'Synthetic'})).rejects.toMatchObject({code:'SNAPSHOT_NOT_EXPECTED'});scheduler.advance(500);}
 run=await runner.saveSnapshot(run.id,item.id,'session',syntheticJpeg,{capturedAt:scheduler.now(),cameraLabel:'Synthetic'});const committed=runner.read(run.id);expect((await runner.saveSnapshot(run.id,item.id,'session',syntheticJpeg,{capturedAt:scheduler.now(),cameraLabel:'Synthetic'})).revision).toBe(committed.revision);
 }
 expect(run.status).toBe('needs_review');expect(run.items.map(item=>item.ordinal)).toEqual([1,2,3,4,5]);expect(run.items.map(item=>item.savedAt)).toEqual([0,500,500,1000,1000]);expect(adapters[0]?.sent).toEqual(['RIGHT','LEFT']);expect(tv.remoteState().enabled).toBe(true);
 const changed=Buffer.from(syntheticJpeg);changed[changed.length-3]=0;await expect(runner.saveSnapshot(run.id,run.items[0]!.id,'session',changed,{capturedAt:0,cameraLabel:'Synthetic'})).rejects.toMatchObject({code:'SNAPSHOT_CONFLICT'});
 }finally{await runner.close();await tv.close();db.close();await rm(dataDir,{recursive:true,force:true});}
});
test('lost client expires deterministically and restart never resumes commands',async()=>{
 const db=new Database(':memory:');db.exec(testRunsTableSql);const dataDir=await mkdtemp(join(tmpdir(),'runner-expiry-'));
 const {service:tv,adapters,scheduler}=harness();tv.start({action:'pair',host:'192.168.1.10'});await drain();await succeed(adapters[0]!);
 const id=randomUUID(),scenario={id,title:'Synthetic',description:'',group:'',steps:[{id:randomUUID(),kind:'given' as const,text:'Initial'}],status:'draft' as const,version:1,createdAt:0,updatedAt:0};
 const repo=createTestRunRepository(db),store=await createArtifactStore({dataDir});const diagnostics:string[]=[];const runner=createTestRunService({repository:repo,artifacts:store,readCase:()=>scenario,resolveTv:()=>tv,now:()=>scheduler.now(),scheduler,onPersistenceFailure:code=>diagnostics.push(code)});
 try{const run=runner.start({id:randomUUID(),caseId:id,version:1,tvId:randomUUID()},'session','webos','TV');scheduler.advance(19999);expect(runner.read(run.id).status).toBe('running');scheduler.advance(1);expect(runner.read(run.id)).toMatchObject({status:'error',failure:{code:'CLIENT_DISCONNECTED'}});
 const restartId=randomUUID();repo.create({...run,id:restartId,status:'running',items:run.items.map(item=>({...item,phase:'sending'}))});await runner.recover();expect(runner.read(restartId)).toMatchObject({status:'error',failure:{code:'SERVER_RESTARTED'}});expect(runner.read(restartId).items[0]?.delivery?.outcome).toBe('unknown');expect(adapters[0]?.sent).toEqual([]);
 const full=runner.start({id:randomUUID(),caseId:id,version:1,tvId:randomUUID()},'session','webos','TV');const replace=vi.spyOn(repo,'replace').mockImplementation(()=>{throw new Error('SQLITE_FULL');});
 expect(()=>scheduler.advance(20000)).not.toThrow();expect(tv.remoteState().enabled).toBe(true);expect(diagnostics).toEqual(['RUN_STATE_STORAGE_FAILED']);expect(()=>runner.advance(full.id,full.items[0]!.id,'session')).toThrow();replace.mockRestore();
 }finally{await runner.close();await tv.close();db.close();await rm(dataDir,{recursive:true,force:true});}
});
test('stop during accepted upload publishes finalizing state and retains the saved evidence',async()=>{
 const db=new Database(':memory:');db.exec(testRunsTableSql);const dataDir=await mkdtemp(join(tmpdir(),'runner-stop-save-'));
 const {service:tv,adapters,scheduler}=harness();tv.start({action:'pair',host:'192.168.1.10'});await drain();await succeed(adapters[0]!);
 const id=randomUUID(),scenario={id,title:'Synthetic',description:'',group:'',steps:[{id:randomUUID(),kind:'given' as const,text:'Initial'}],status:'draft' as const,version:1,createdAt:0,updatedAt:0};
 const store=await createArtifactStore({dataDir}),entered=barrier<void>(),resume=barrier<void>();
 const runner=createTestRunService({repository:createTestRunRepository(db),artifacts:{...store,async save(...args){entered.resolve();await resume.promise;return store.save(...args);}},readCase:()=>scenario,resolveTv:()=>tv,now:()=>scheduler.now(),scheduler});
 try{const run=runner.start({id:randomUUID(),caseId:id,version:1,tvId:randomUUID()},'session','webos','TV');const item=run.items[0]!;await runner.advance(run.id,item.id,'session');const uploading=runner.saveSnapshot(run.id,item.id,'session',syntheticJpeg,{capturedAt:0,cameraLabel:'Synthetic'});await entered.promise;
 expect(runner.stop(run.id,'session')).toMatchObject({status:'stopped',settling:true});expect(tv.remoteState().enabled).toBe(false);resume.resolve();await uploading;
 expect(runner.read(run.id)).toMatchObject({status:'stopped',settling:false,items:[{phase:'saved'}]});expect(tv.remoteState().enabled).toBe(true);
 }finally{resume.resolve();await runner.close();await tv.close();db.close();await rm(dataDir,{recursive:true,force:true});}
});
test('stop during delivery records unknown outcome and does not replay a command',async()=>{
 const db=new Database(':memory:');db.exec(testRunsTableSql);const dataDir=await mkdtemp(join(tmpdir(),'runner-stop-send-'));
 const {service:tv,adapters,scheduler}=harness();tv.start({action:'pair',host:'192.168.1.10'});await drain();await succeed(adapters[0]!);const adapter=adapters[0]!,resume=barrier<void>();adapter.sendResult=resume.promise;
 const id=randomUUID(),scenario={id,title:'Synthetic',description:'',group:'',steps:[{id:randomUUID(),kind:'when' as const,text:'Move',actions:[{id:randomUUID(),action:'RIGHT' as const,pauseAfterMs:500}]}],status:'draft' as const,version:1,createdAt:0,updatedAt:0};
 const runner=createTestRunService({repository:createTestRunRepository(db),artifacts:await createArtifactStore({dataDir}),readCase:()=>scenario,resolveTv:()=>tv,now:()=>scheduler.now(),scheduler});
 try{const run=runner.start({id:randomUUID(),caseId:id,version:1,tvId:randomUUID()},'session','webos','TV');const pending=runner.advance(run.id,run.items[0]!.id,'session');await adapter.enteredSend.promise;runner.stop(run.id,'session');await pending;
 expect(runner.read(run.id)).toMatchObject({status:'stopped',settling:false,items:[{delivery:{outcome:'unknown'}}]});await runner.advance(run.id,run.items[0]!.id,'session');expect(adapter.sent).toEqual(['RIGHT']);resume.resolve();await drain();
 }finally{resume.resolve();await runner.close();await tv.close();db.close();await rm(dataDir,{recursive:true,force:true});}
});
