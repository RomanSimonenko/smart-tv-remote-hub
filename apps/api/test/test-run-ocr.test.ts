import {expect,test,vi} from 'vitest';
import Database from 'better-sqlite3';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {type TestCase} from '@remote-webos-tv/contracts';
import {createTestRunRepository,testRunsTableSql} from '../src/test-runs/repository.js';
import {createArtifactStore} from '../src/test-runs/artifacts.js';
import {createTestRunService} from '../src/test-runs/service.js';
import {harness,succeed,drain,barrier} from './support/tv-harness.js';
import {syntheticJpeg} from './support/synthetic-jpeg.js';
const observation={blocks:[{text:'Мое кино'},{text:'Мои подписки'}],engine:'synthetic',model:'1'};
async function fixture(recognize=vi.fn(async(_image:Buffer,_signal:AbortSignal)=>observation),actions=false){
 const db=new Database(':memory:');db.exec(testRunsTableSql);const dataDir=await mkdtemp(join(tmpdir(),'ocr-service-'));
 const {service:tv,adapters,scheduler}=harness();tv.start({action:'pair',host:'192.168.1.10'});await drain();await succeed(adapters[0]!);
 const scenario:TestCase={id:randomUUID(),title:'Synthetic',description:'',group:'',steps:[{id:randomUUID(),kind:'then',text:'Profile',textConditions:['Мое кино','Мои подписки'],...(actions?{actions:[{id:randomUUID(),action:'RIGHT',pauseAfterMs:500},{id:randomUUID(),action:'ENTER',pauseAfterMs:500}]}:{})},{id:randomUUID(),kind:'when',text:'Next',actions:[{id:randomUUID(),action:'LEFT',pauseAfterMs:0}]}],status:'draft',version:1,createdAt:0,updatedAt:0};
 const repo=createTestRunRepository(db),store=await createArtifactStore({dataDir});
 const runner=createTestRunService({repository:repo,artifacts:store,readCase:()=>scenario,resolveTv:()=>tv,now:()=>scheduler.now(),scheduler,recognize});
 const run=runner.start({id:randomUUID(),caseId:scenario.id,version:1,tvId:randomUUID()},'session','webos','TV');
 async function upload(index=0){const item=run.items[index]!;await runner.advance(run.id,item.id,'session');scheduler.advance(item.action?.pauseAfterMs??0);return runner.saveSnapshot(run.id,item.id,'session',syntheticJpeg,{capturedAt:scheduler.now(),cameraLabel:'Synthetic'});}
 return{runner,run,upload,recognize,adapters,repo,store,scenario,async close(){await runner.close();await tv.close();db.close();await rm(dataDir,{recursive:true,force:true});}};
}
test('checks one snapshot and persists all conditions before allowing next step',async()=>{
 const f=await fixture();try{
 const checked=await f.upload();expect(f.recognize).toHaveBeenCalledWith(expect.any(Buffer),expect.any(AbortSignal),f.scenario.steps[0]!.textConditions);expect(checked.items[0]?.verification).toMatchObject({status:'passed',conditions:[{found:true},{found:true}],recognizedBlocks:observation.blocks});expect(f.recognize).toHaveBeenCalledTimes(1);
 const result=await f.upload(1);expect(result.status).toBe('passed');expect(f.repo.list().runs[0]?.status).toBe('passed');
 const retry=await f.runner.saveSnapshot(f.run.id,f.run.items[0]!.id,'session',syntheticJpeg,{capturedAt:0,cameraLabel:'Synthetic'});expect(retry.status).toBe('passed');expect(f.recognize).toHaveBeenCalledTimes(1);
 }finally{await f.close();}
});
test.each([{blocks:[]},{blocks:[{text:'Мое кино'}]}])('missing labels fail and prevent subsequent TV commands',async ({blocks})=>{
 const f=await fixture(vi.fn(async()=>({...observation,blocks})));try{const result=await f.upload();expect(result.status).toBe('failed');await f.runner.advance(f.run.id,f.run.items[1]!.id,'session');expect(f.adapters[0]?.sent).toEqual([]);expect(result.items[0]?.verification?.conditions[1]?.found).toBe(false);}finally{await f.close();}
});
test('checks only the last existing snapshot after the last action pause',async()=>{
 const f=await fixture(undefined,true);try{const first=await f.upload(0);expect(first.items[0]?.verification).toBeUndefined();expect(f.recognize).not.toHaveBeenCalled();await f.upload(1);expect(f.recognize).toHaveBeenCalledTimes(1);expect(f.adapters[0]?.sent).toEqual(['RIGHT','ENTER']);}finally{await f.close();}
});
test('OCR failure preserves evidence and reports a technical error',async()=>{
 const f=await fixture(vi.fn(async()=>{throw new Error('private detail');}));try{const result=await f.upload();expect(result).toMatchObject({status:'error',failure:{stage:'ocr',code:'OCR_FAILED'},items:[{phase:'saved'},{}]});expect(JSON.stringify(result)).not.toContain('private detail');}finally{await f.close();}
});
test('pending OCR blocks advance and duplicate upload shares work; stop ignores a late result',async()=>{
 const entered=barrier<void>(),resume=barrier<void>();const f=await fixture(vi.fn(async()=>{entered.resolve();await resume.promise;return observation;}));
 try{const pending=f.upload();await entered.promise;expect(f.runner.read(f.run.id).items[0]?.verificationState).toBe('running');
 expect(()=>f.runner.advance(f.run.id,f.run.items[1]!.id,'session')).toThrow('ITEM_SAVE_IN_PROGRESS');
 const retry=f.runner.saveSnapshot(f.run.id,f.run.items[0]!.id,'session',syntheticJpeg,{capturedAt:0,cameraLabel:'Synthetic'});
 expect(f.runner.stop(f.run.id,'session').status).toBe('stopped');resume.resolve();await Promise.all([pending,retry]);expect(f.runner.read(f.run.id)).toMatchObject({status:'stopped',settling:false});expect(f.runner.read(f.run.id).items[0]?.verification).toBeUndefined();expect(f.recognize).toHaveBeenCalledTimes(1);expect(f.adapters[0]?.sent).toEqual([]);
 }finally{resume.resolve();await f.close();}
});
test('a failed OCR-state write fails closed and never permits the next command',async()=>{
 const f=await fixture();const replace=f.repo.replace;const injected=vi.spyOn(f.repo,'replace').mockImplementation((run,revision)=>{
  if(run.items.some(item=>item.verificationState==='running')){injected.mockRestore();throw new Error('synthetic write failure');}return replace(run,revision);
 });
 try{await expect(f.upload()).rejects.toThrow('synthetic write failure');expect(f.runner.read(f.run.id).status).toBe('error');await f.runner.advance(f.run.id,f.run.items[1]!.id,'session');expect(f.adapters[0]?.sent).toEqual([]);}finally{injected.mockRestore();await f.close();}
});
test.each(['revoke','close'] as const)('%s during OCR cancels lifecycle and discards a late result',async mode=>{
 const entered=barrier<void>(),resume=barrier<void>();const f=await fixture(vi.fn(async()=>{entered.resolve();await resume.promise;return observation;}));
 try{const pending=f.upload();await entered.promise;const terminating=mode==='revoke'?f.runner.revoke('session'):f.runner.close();expect(f.runner.read(f.run.id).status).toBe('error');resume.resolve();await Promise.all([pending,terminating]);expect(f.runner.read(f.run.id).items[0]?.verification).toBeUndefined();expect(f.runner.read(f.run.id).settling).toBe(false);expect(f.adapters[0]?.sent).toEqual([]);}finally{resume.resolve();await f.close();}
});
test('recovery marks a saved snapshot awaiting verification as error without executing OCR or commands',async()=>{
 const f=await fixture();try{const initial=f.repo.read(f.run.id)!;const stored=await f.store.save(f.run.id,f.run.items[0]!.id,syntheticJpeg);f.repo.replace({...initial,items:initial.items.map((item,index)=>index===0?{...item,...stored,phase:'saved'}:item)},initial.revision);await f.runner.recover();expect(f.runner.read(f.run.id)).toMatchObject({status:'error',failure:{code:'SERVER_RESTARTED'}});expect(f.recognize).not.toHaveBeenCalled();expect(f.adapters[0]?.sent).toEqual([]);}finally{await f.close();}
});
