import type {TestRun} from '@remote-webos-tv/contracts';
import type {CameraSnapshot} from './camera-snapshot.js';
export function waitForPause(ms:number,signal:AbortSignal):Promise<void>{return new Promise((resolve,reject)=>{
 const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new DOMException('Run cancelled','AbortError'));};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
});}
export async function executeTestRun(initial:TestRun,deps:{signal:AbortSignal;advance(id:string,itemId:string):Promise<TestRun>;capture(signal:AbortSignal):Promise<CameraSnapshot>;upload(id:string,itemId:string,snapshot:CameraSnapshot):Promise<TestRun>;onUpdate(run:TestRun):void;wait?:(ms:number,signal:AbortSignal)=>Promise<void>}){
 let run=initial;
 while(run.status==='running'){
  deps.signal.throwIfAborted();const item=run.items.find(value=>value.phase!=='saved');if(!item)throw new Error('RUN_HAS_NO_PENDING_ITEM');
  run=await deps.advance(run.id,item.id);deps.onUpdate(run);deps.signal.throwIfAborted();if(run.status!=='running')return run;
  const current=run.items.find(value=>value.id===item.id);if(current?.phase!=='awaiting_snapshot')throw new Error('COMMAND_RESULT_UNKNOWN');
  // Wait from receipt of delivery; no assumption about browser/server clock offset.
  await (deps.wait??waitForPause)(item.action?.pauseAfterMs??0,deps.signal);deps.signal.throwIfAborted();
  const snapshot=await deps.capture(deps.signal);deps.signal.throwIfAborted();
  run=await deps.upload(run.id,item.id,snapshot);deps.onUpdate(run);
 }
 return run;
}
