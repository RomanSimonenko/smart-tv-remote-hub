import {createHash,randomUUID} from 'node:crypto';
import {RUN_LEASE_MS,startTestRunSchema,type StartTestRun,type TestRun,type TestCase,type RunFailure,type TvPlatform,type TvCommandResult} from '@remote-webos-tv/contracts';
import type {TestRunRepository} from './repository.js';
import type {ArtifactStore} from './artifacts.js';
import type {TvService,TvScheduler} from '../tv/service.js';
export class RunError extends Error {constructor(readonly code:string,readonly statusCode=409){super(code);}}
interface Active {owner:string;tv:TvService;lease:symbol;controller:AbortController;terminating?:boolean;timer?:unknown;pending?:Promise<TestRun>;saving?:Promise<TestRun>}
export function createTestRunService(deps:{repository:TestRunRepository;artifacts:ArtifactStore;readCase(id:string):TestCase|undefined;resolveTv(id:string):TvService|null;now():number;scheduler:TvScheduler;newId?:()=>string;onPersistenceFailure?:(code:'RUN_STATE_STORAGE_FAILED')=>void}){
 const {repository,artifacts,now,scheduler}=deps;const active=new Map<string,Active>();let closed=false;
 const read=(id:string)=>{const value=repository.read(id);if(!value)throw new RunError('RUN_NOT_FOUND',404);return value;};
 function owner(id:string,token:string){const entry=active.get(id);if(entry&&entry.owner!==token)throw new RunError('RUN_OWNED_BY_ANOTHER_SESSION',403);return entry;}
 function release(id:string){const entry=active.get(id);if(!entry)return;if(entry.timer!==undefined)scheduler.clearTimeout(entry.timer);entry.tv.releaseRunLease(entry.lease);active.delete(id);}
 function diagnosePersistence(){try{if(deps.onPersistenceFailure)deps.onPersistenceFailure('RUN_STATE_STORAGE_FAILED');else console.error('RUN_STATE_STORAGE_FAILED');}catch{console.error('RUN_DIAGNOSTIC_FAILED');}}
 function terminal(id:string,status:'stopped'|'error'|'needs_review',failure?:RunFailure){
  const entry=active.get(id);
  if(entry){entry.terminating=true;entry.controller.abort();if(entry.timer!==undefined)scheduler.clearTimeout(entry.timer);}
  try{const run=read(id);if(run.status!=='running')return run;
   return repository.replace({...run,status,settling:!!(entry?.pending||entry?.saving),endedAt:now(),...(failure?{failure}:{})},run.revision);
  }finally{if(entry&&!entry.pending&&!entry.saving)release(id);}
 }
 function settled(id:string,entry:Active){if(!entry.terminating||entry.pending||entry.saving)return;
  try{const run=read(id);if(run.settling)repository.replace({...run,settling:false},run.revision);}catch{diagnosePersistence();}finally{release(id);}
 }
 function heartbeat(id:string,token:string){const run=read(id),entry=owner(id,token);if(!entry||run.status!=='running')return run;
  if(entry.terminating)return run;if(entry.timer!==undefined)scheduler.clearTimeout(entry.timer);
  const capture=run.items.find(item=>item.phase!=='saved')?.captureNotBefore??0;
  entry.timer=scheduler.setTimeout(()=>{try{terminal(id,'error',{stage:'connection',code:'CLIENT_DISCONNECTED'});}catch{diagnosePersistence();}},Math.max(RUN_LEASE_MS,capture-now()+RUN_LEASE_MS));return run;
 }
 function start(input:StartTestRun,token:string,platform:TvPlatform,tvName:string,tvPlatformVersion?:string){
  if(closed)throw new RunError('RUN_SERVICE_CLOSED',503);input=startTestRunSchema.parse(input);
  const previous=repository.read(input.id);if(previous){owner(input.id,token);if(previous.testCase.id!==input.caseId||previous.testCase.version!==input.version||previous.tvId!==input.tvId)throw new RunError('RUN_CONFLICT');return previous;}
  const scenario=deps.readCase(input.caseId);if(!scenario)throw new RunError('CASE_NOT_FOUND',404);if(scenario.version!==input.version)throw new RunError('VERSION_CONFLICT');if(!scenario.steps.length)throw new RunError('EMPTY_TEST_CASE',422);
  const tv=deps.resolveTv(input.tvId);if(!tv)throw new RunError('TV_NOT_FOUND',404);
  const remote=tv.remoteState(),power=tv.powerState();
  for(const step of scenario.steps)for(const action of step.actions??[]){
   if(action.action==='power'){if(!power.canPowerOff&&!power.canWake)throw new RunError('UNSUPPORTED_CAPABILITY',422);}
   else if(!remote.enabled||action.action==='wink'&&!remote.apps)throw new RunError(remote.enabled?'UNSUPPORTED_CAPABILITY':'TV_UNAVAILABLE',422);
  }
  if(!scenario.steps.some(step=>step.actions?.length)&&!remote.enabled)throw new RunError('TV_UNAVAILABLE');
  const lease=Symbol('test run');tv.acquireRunLease(lease);
  try{
   const newId=deps.newId??randomUUID;let ordinal=0;
   const items=scenario.steps.flatMap(step=>(step.actions?.length?step.actions:[undefined]).map(action=>({id:newId(),stepId:step.id,ordinal:++ordinal,phase:'pending' as const,...(action?{action}:{})})));
   const run=repository.create({id:input.id,testCase:scenario,tvId:input.tvId,platform,tvName,...(tvPlatformVersion?{tvPlatformVersion}:{}),startedAt:now(),status:'running',items,revision:0});
   active.set(run.id,{owner:token,tv,lease,controller:new AbortController()});heartbeat(run.id,token);return run;
  }catch(cause){tv.releaseRunLease(lease);throw cause;}
 }
 async function powerCommand(entry:Active,id:string):Promise<TvCommandResult>{
  return entry.tv.sendRunPower(id,entry.owner,entry.controller.signal,entry.lease);
 }
 function advance(id:string,itemId:string,token:string):Promise<TestRun>{
  const run=read(id),entry=owner(id,token);if(run.status!=='running')return Promise.resolve(run);if(!entry||entry.terminating)throw new RunError('RUN_NOT_ACTIVE');
  const current=run.items.find(item=>item.phase!=='saved');if(!current||current.id!==itemId)throw new RunError('ITEM_OUT_OF_ORDER');
  if(entry.saving)throw new RunError('ITEM_SAVE_IN_PROGRESS');if(entry.pending)return entry.pending;
  if(current.phase!=='pending')return Promise.resolve(run);
  repository.replace({...run,items:run.items.map(item=>item.id===itemId?{...item,phase:'sending'}:item)},run.revision);
  // Publish durable sending before touching transport: ambiguous delivery is never replayed.
  const pending=Promise.resolve().then(async()=>{
   let delivery:TvCommandResult|undefined;
   if(current.action){const action=current.action.action;delivery=action==='power'?await powerCommand(entry,itemId):await entry.tv.sendCommand(action==='wink'?{id:itemId,app:'wink'}:{id:itemId,button:action},entry.controller.signal,entry.lease);}
   const latest=read(id);const captureNotBefore=now()+(current.action?.pauseAfterMs??0);
   const updated=repository.replace({...latest,items:latest.items.map(item=>item.id===itemId?{...item,phase:'awaiting_snapshot',captureNotBefore,...(delivery?{delivery}:{})}:item)},latest.revision);
   if(updated.status==='running'&&delivery&&delivery.outcome!=='sent')return terminal(id,'error',{stage:'command',code:delivery.error.code});
   heartbeat(id,token);return updated;
  }).catch(cause=>{try{terminal(id,'error',{stage:'command',code:'COMMAND_RESULT_UNKNOWN'});}catch(persistence){diagnosePersistence();throw new AggregateError([cause,persistence],'Command outcome and run failure could not be persisted');}throw cause;}).finally(()=>{delete entry.pending;settled(id,entry);});
  entry.pending=pending;return pending;
 }
 async function saveSnapshot(id:string,itemId:string,token:string,data:Buffer,metadata:{capturedAt:number;cameraLabel:string}){
  const run=read(id),entry=owner(id,token);const item=run.items.find(value=>value.id===itemId);if(!item)throw new RunError('ITEM_NOT_FOUND',404);
  if(item.phase==='saved'){if(item.sha256!==createHash('sha256').update(data).digest('hex'))throw new RunError('SNAPSHOT_CONFLICT');return run;}
  if(!entry||entry.terminating||run.status!=='running')throw new RunError('RUN_NOT_ACTIVE');if(entry.saving)throw new RunError('ITEM_SAVE_IN_PROGRESS');
  if(item.phase!=='awaiting_snapshot'||run.items.find(value=>value.phase!=='saved')?.id!==itemId||now()<(item.captureNotBefore??Infinity))throw new RunError('SNAPSHOT_NOT_EXPECTED');
  const pending=(async()=>{
   try{const stored=await artifacts.save(id,itemId,data);const latest=read(id);
    const updated=repository.replace({...latest,items:latest.items.map(value=>value.id===itemId?{...value,...stored,...metadata,phase:'saved',savedAt:now()}:value)},latest.revision);
    if(updated.status==='running'&&updated.items.every(value=>value.phase==='saved'))return terminal(id,'needs_review');return updated;
   }catch(cause){try{terminal(id,'error',{stage:'storage',code:cause instanceof Error&&'code'in cause&&['INVALID_SNAPSHOT','ARTIFACT_QUOTA_EXCEEDED','ARTIFACT_STORAGE_FAILED'].includes(String(cause.code))?String(cause.code):'ARTIFACT_STORAGE_FAILED'});}catch(persistence){diagnosePersistence();throw new AggregateError([cause,persistence],'Snapshot and run failure could not be persisted');}throw cause;}
  })();entry.saving=pending;
  try{return await pending;}finally{delete entry.saving;settled(id,entry);}
 }
 return {read,start,advance,saveSnapshot,heartbeat,
  list:repository.list,
  stop(id:string,token:string){owner(id,token);return terminal(id,'stopped');},
  fail(id:string,token:string,failure:RunFailure){owner(id,token);return terminal(id,'error',failure);},
  async recover(){const runs=repository.all(),missing=await artifacts.recover(runs);for(const run of runs)if(run.status==='running'||run.settling||missing.has(run.id))repository.replace({...run,status:'error',settling:false,items:run.items.map(item=>item.phase==='sending'&&!item.delivery?{...item,delivery:{id:item.id,outcome:'unknown',error:{code:'COMMAND_RESULT_UNKNOWN',message:'Доставка команды не была зафиксирована до перезапуска.'}}}:item),endedAt:now(),failure:{stage:missing.has(run.id)?'storage':'lifecycle',code:missing.has(run.id)?'ARTIFACT_MISSING':'SERVER_RESTARTED'}},run.revision);},
  async revoke(token:string){const pending:Promise<unknown>[]=[],failures:unknown[]=[];for(const [id,entry]of active)if(entry.owner===token){try{terminal(id,'error',{stage:'lifecycle',code:'SESSION_REVOKED'});}catch(cause){diagnosePersistence();failures.push(cause);}if(entry.pending)pending.push(entry.pending);if(entry.saving)pending.push(entry.saving);}await Promise.allSettled(pending);if(failures.length)throw new AggregateError(failures,'Run revocation state could not be persisted');},
  async close(){closed=true;const pending:Promise<unknown>[]=[],failures:unknown[]=[];for(const [id,entry]of active){try{terminal(id,'error',{stage:'lifecycle',code:'SERVER_SHUTDOWN'});}catch(cause){diagnosePersistence();failures.push(cause);}if(entry.pending)pending.push(entry.pending);if(entry.saving)pending.push(entry.saving);}await Promise.allSettled(pending);if(failures.length)throw new AggregateError(failures,'Run shutdown state could not be persisted');},
 };
}
export type TestRunService=ReturnType<typeof createTestRunService>;
