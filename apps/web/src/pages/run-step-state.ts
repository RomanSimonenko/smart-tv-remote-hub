import type {TestRun,TestRunItem} from '@remote-webos-tv/contracts';

export function stepState(step:TestRun['testCase']['steps'][number],items:TestRunItem[],status:TestRun['status']):'passed'|'failed'|'completed'|'needs_review'|'running'|'interrupted'|'not_run'{
 const last=items.at(-1);
 const complete=items.length===(step.actions?.length||1)&&items.every(item=>item.phase==='saved');
 if(last?.verification?.status==='failed')return 'failed';
 if(complete){
  if(last?.verification?.status==='passed')return 'passed';
  if(!step.textConditions?.length)return 'completed';
  return status==='running'?'running':'needs_review';
 }
 return items.some(item=>item.phase!=='pending')?(status==='running'?'running':'interrupted'):'not_run';
}
