import {expect,test} from 'vitest';
import {executeTestRun} from './run-execution.js';
import type {TestRun} from '@remote-webos-tv/contracts';
test('execution saves each frame before advancing and stops on storage failure',async()=>{
 const calls:string[]=[];const items=[{id:'one',phase:'pending',action:{pauseAfterMs:500}},{id:'two',phase:'pending'}];
 const run={id:'run',status:'running',items} as unknown as TestRun;
 await expect(executeTestRun(run,{signal:new AbortController().signal,onUpdate(){},
  advance:async(_id,itemId)=>{calls.push(`advance:${itemId}`);return {...run,items:items.map(item=>({...item,phase:item.id===itemId?'awaiting_snapshot':item.phase}))} as TestRun;},
  wait:async ms=>{calls.push(`wait:${ms}`);},capture:async()=>{calls.push('capture');return {blob:new Blob(),capturedAt:1,cameraLabel:'Synthetic'};},
  upload:async()=>{calls.push('upload');throw new Error('disk');},
 })).rejects.toThrow('disk');
 expect(calls).toEqual(['advance:one','wait:500','capture','upload']);
});
