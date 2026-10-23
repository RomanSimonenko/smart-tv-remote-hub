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

async function fixture(platform:'webos'|'tizen'|'whale'='webos'){
 const db=new Database(':memory:');db.exec(testRunsTableSql);const dataDir=await mkdtemp(join(tmpdir(),'run-hold-'));
 const h=harness(false,{platform});h.service.start({action:'pair',host:'192.168.1.10'});await drain();await succeed(h.adapters[0]!);
 const adapter=h.adapters[0]!,frames:string[]=[];
 const native=Object.assign(adapter,{nativeHoldButtons:['RIGHT'],pressButton:vi.fn(async()=>{frames.push('Press');}),releaseButton:vi.fn(async()=>{frames.push('Release');})});
 const scenario={id:randomUUID(),title:'Synthetic',description:'',group:'',steps:[{id:randomUUID(),kind:'when' as const,text:'Hold',actions:[{id:randomUUID(),action:'RIGHT' as const,pauseAfterMs:500,holdForMs:1000}]}],status:'draft' as const,version:1,createdAt:0,updatedAt:0};
 const runner=createTestRunService({repository:createTestRunRepository(db),artifacts:await createArtifactStore({dataDir}),readCase:()=>scenario,resolveTv:()=>h.service,now:h.scheduler.now,scheduler:h.scheduler});
 return {...h,adapter:native,frames,runner,scenario,start:()=>runner.start({id:randomUUID(),caseId:scenario.id,version:1,tvId:randomUUID()},'owner',platform,'Synthetic TV'),async close(){await runner.close();await h.service.close();db.close();await rm(dataDir,{recursive:true,force:true});}};
}
test('LG hold repeats on schedule, is not replayed and starts pause after completion',async()=>{
 const h=await fixture();try{const run=h.start(),item=run.items[0]!;
 const pending=h.runner.advance(run.id,item.id,'owner');expect(h.runner.advance(run.id,item.id,'owner')).toBe(pending);await drain();
 expect(h.adapter.sent).toEqual(['RIGHT']);expect(h.runner.read(run.id).items[0]?.phase).toBe('sending');
 h.scheduler.advance(399);await drain();expect(h.adapter.sent).toHaveLength(1);
 h.scheduler.advance(1);await drain();expect(h.adapter.sent).toHaveLength(2);
 h.scheduler.advance(200);await drain();expect(h.adapter.sent).toHaveLength(3);
 h.scheduler.advance(400);await drain();const done=await pending;
 expect(done.items[0]).toMatchObject({phase:'awaiting_snapshot',captureNotBefore:1500,delivery:{outcome:'sent'}});
 await h.runner.advance(run.id,item.id,'owner');expect(h.adapter.sent).toHaveLength(3);
 }finally{await h.close();}
});
test('Samsung uses Press and Release, with no Click repeats',async()=>{
 const h=await fixture('tizen');try{const run=h.start();const pending=h.runner.advance(run.id,run.items[0]!.id,'owner');await drain();
 expect(h.frames).toEqual(['Press']);h.scheduler.advance(1000);await drain();
 expect((await pending).items[0]?.delivery?.outcome).toBe('sent');expect(h.frames).toEqual(['Press','Release']);expect(h.adapter.sent).toEqual([]);
 }finally{await h.close();}
});
test('Samsung duration starts when Press settles and early watchdog release is not successful',async()=>{
 const h=await fixture('tizen');try{const run=h.start(),press=barrier<void>();h.adapter.pressButton.mockImplementation(async()=>{h.frames.push('Press');await press.promise;});
 const pending=h.runner.advance(run.id,run.items[0]!.id,'owner');await drain();h.scheduler.advance(300);press.resolve();await drain();
 h.scheduler.advance(700);await drain();expect(h.frames).toEqual(['Press']);
 h.scheduler.advance(300);await drain();expect((await pending).items[0]?.captureNotBefore).toBe(1800);expect(h.frames).toEqual(['Press','Release']);
 }finally{await h.close();}
 const s=await fixture('tizen');try{s.scenario.steps[0]!.actions[0]!.holdForMs=4000;const run=s.start(),press=barrier<void>(),release=barrier<void>();s.adapter.pressButton.mockImplementation(async()=>{s.frames.push('Press');await press.promise;});s.adapter.releaseButton.mockImplementation(async()=>{s.frames.push('Release');await release.promise;});
 const pending=s.runner.advance(run.id,run.items[0]!.id,'owner');await drain();s.scheduler.advance(2000);press.resolve();await drain();s.scheduler.advance(3000);await drain();expect(s.frames).toEqual(['Press','Release']);s.scheduler.advance(1000);await drain();release.resolve();await drain();expect((await pending).items[0]?.delivery?.outcome).toBe('unknown');
 }finally{await s.close();}
});
test('LG command latency does not shift repeat tick deadlines or queue missed ticks',async()=>{
 const h=await fixture();try{const run=h.start(),first=barrier<void>();h.adapter.sendResult=first.promise;
 const pending=h.runner.advance(run.id,run.items[0]!.id,'owner');await drain();h.scheduler.advance(100);h.adapter.sendResult=Promise.resolve();first.resolve();await drain();
 h.scheduler.advance(300);await drain();expect(h.adapter.sent).toHaveLength(2);
 h.scheduler.advance(200);await drain();expect(h.adapter.sent).toHaveLength(3);
 h.scheduler.advance(400);await drain();await pending;
 }finally{await h.close();}
});
test.each(['stop','revoke','close'] as const)('Samsung %s releases before the run lease is returned',async action=>{
 const h=await fixture('tizen');try{const run=h.start();const pending=h.runner.advance(run.id,run.items[0]!.id,'owner');await drain();
 const release=barrier<void>();h.adapter.releaseButton.mockImplementation(async()=>{h.frames.push('Release');await release.promise;});
 const cleanup=action==='stop'?h.runner.stop(run.id,'owner'):action==='revoke'?h.runner.revoke('owner'):h.runner.close();await drain();
 expect(h.frames).toEqual(['Press','Release']);expect(h.service.remoteState()).toMatchObject({enabled:false,reason:'BUSY'});
 release.resolve();await pending;await cleanup;expect(h.service.remoteState().enabled).toBe(true);
 h.scheduler.advance(4000);await drain();expect(h.frames).toEqual(['Press','Release']);
 }finally{await h.close();}
});
test.each(['whale','tizen'] as const)('unsupported %s holds are rejected before creating a run',async platform=>{
 const h=await fixture(platform);try{h.adapter.nativeHoldButtons=[];expect(h.start).toThrowError('UNSUPPORTED_CAPABILITY');expect(h.frames).toEqual([]);expect(h.adapter.sent).toEqual([]);}finally{await h.close();}
});
test('LG cancellation stops repeats and release failure cannot look successful on Samsung',async()=>{
 const h=await fixture();try{const run=h.start();const pending=h.runner.advance(run.id,run.items[0]!.id,'owner');await drain();h.runner.stop(run.id,'owner');await pending;
 h.scheduler.advance(2000);await drain();expect(h.adapter.sent).toEqual(['RIGHT']);}finally{await h.close();}
 const s=await fixture('tizen');try{const run=s.start();s.adapter.releaseButton.mockRejectedValue(new Error('Synthetic release failed'));const pending=s.runner.advance(run.id,run.items[0]!.id,'owner');await drain();s.scheduler.advance(1000);await drain();
 expect(await pending).toMatchObject({status:'error',failure:{code:'COMMAND_RESULT_UNKNOWN'}});expect(s.adapter.closed).toBe(true);
 }finally{await s.close();}
});
