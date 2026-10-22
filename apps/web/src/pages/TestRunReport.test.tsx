import {act,cleanup,render,screen,fireEvent} from '@testing-library/react';import {afterEach,expect,test,vi} from 'vitest';
import {TestRunReport} from './TestRunReport.js';import {api} from '../api.js';import type {TestRun} from '@remote-webos-tv/contracts';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
test('groups snapshots by actual case steps and opens the failed step by default',async()=>{
 const id=crypto.randomUUID(),stepIds=Array.from({length:4},()=>crypto.randomUUID());
 const actions=[{id:crypto.randomUUID(),action:'RIGHT' as const,pauseAfterMs:500},{id:crypto.randomUUID(),action:'ENTER' as const,pauseAfterMs:0}];
 const check=(status:'passed'|'failed')=>({status,conditions:[{expected:'Каталог',found:status==='passed'}],recognizedBlocks:[],engine:'synthetic',model:'1',checkedAt:2,snapshotSha256:'0'.repeat(64)});
 const run:TestRun={id,testCase:{id,title:'Synthetic',description:'',group:'',status:'draft',version:1,createdAt:0,updatedAt:0,steps:[{id:stepIds[0]!,kind:'given',text:'Начало'},{id:stepIds[1]!,kind:'when',text:'Действие',actions,textConditions:['Каталог']},{id:stepIds[2]!,kind:'then',text:'Результат',textConditions:['Каталог']},{id:stepIds[3]!,kind:'then',text:'Следующий шаг'}]},tvId:id,platform:'webos',tvName:'Synthetic',status:'failed',startedAt:1,revision:1,items:[{id:crypto.randomUUID(),stepId:stepIds[0]!,ordinal:1,phase:'saved',capturedAt:1,savedAt:1},...actions.map((action,index)=>({id:crypto.randomUUID(),stepId:stepIds[1]!,ordinal:index+2,action,phase:'saved' as const,capturedAt:1,savedAt:1,...(index===1?{verification:check('passed')}:{})})),{id:crypto.randomUUID(),stepId:stepIds[2]!,ordinal:4,phase:'saved',capturedAt:1,savedAt:1,verification:check('failed')},{id:crypto.randomUUID(),stepId:stepIds[3]!,ordinal:5,phase:'pending'}]};
 vi.spyOn(api,'getTestRun').mockResolvedValue(run);
 const view=render(<TestRunReport runId={id} initialRun={run} onBack={()=>{}} onNewRun={()=>{}} onSessionExpired={()=>{}}/>);
 expect(view.container.querySelectorAll('.report-step-list > li')).toHaveLength(4);
 const summaries=Array.from(view.container.querySelectorAll('summary'));
 expect(summaries.map(summary=>summary.getAttribute('data-status'))).toEqual(['completed','passed','failed','not_run']);
 expect(summaries[2]!.parentElement?.hasAttribute('open')).toBe(true);
 expect(summaries[1]!.parentElement?.hasAttribute('open')).toBe(false);
 fireEvent.click(summaries[1]!);
 expect(summaries[1]!.parentElement?.querySelectorAll('.run-evidence-list > li')).toHaveLength(2);
 const snapshot=screen.getByRole('button',{name:/Снимок 3/});fireEvent.click(snapshot);
 expect(screen.getByRole('img',{name:'Снимок 3: Действие'}).getAttribute('src')).toContain(run.items[2]!.id);
 expect(screen.getByText('Шаг 2. Когда · Действие')).toBeTruthy();
 fireEvent.click(summaries[1]!);expect(summaries[1]!.parentElement?.hasAttribute('open')).toBe(false);
 await act(async()=>{});
});

test('does not mark partial execution or unfinished automatic checks as passed',async()=>{
 const id=crypto.randomUUID(),first=crypto.randomUUID(),second=crypto.randomUUID();
 const actions=[{id:crypto.randomUUID(),action:'RIGHT' as const,pauseAfterMs:500},{id:crypto.randomUUID(),action:'ENTER' as const,pauseAfterMs:0}];
 const run:TestRun={id,testCase:{id,title:'Synthetic',description:'',group:'',status:'draft',version:1,createdAt:0,updatedAt:0,steps:[{id:first,kind:'when',text:'Частичный шаг',actions},{id:second,kind:'then',text:'Незавершённая проверка',textConditions:['Каталог']}]},tvId:id,platform:'webos',tvName:'Synthetic',status:'error',startedAt:1,revision:1,items:[{id:crypto.randomUUID(),stepId:first,ordinal:1,phase:'saved',capturedAt:1,savedAt:1},{id:crypto.randomUUID(),stepId:first,ordinal:2,phase:'awaiting_snapshot'},{id:crypto.randomUUID(),stepId:second,ordinal:3,phase:'saved',verificationState:'running',capturedAt:1,savedAt:1}]};
 vi.spyOn(api,'getTestRun').mockResolvedValue(run);
 const view=render(<TestRunReport runId={id} initialRun={run} onBack={()=>{}} onNewRun={()=>{}} onSessionExpired={()=>{}}/>);
 expect(Array.from(view.container.querySelectorAll('summary')).map(summary=>summary.getAttribute('data-status'))).toEqual(['interrupted','needs_review']);
 await act(async()=>{});
});
test('stopped report waits for an already accepted snapshot to settle',async()=>{
 vi.useFakeTimers();const id='00000000-0000-4000-8000-000000000001';
 const run={id,testCase:{id,title:'Synthetic',description:'',group:'',steps:[{id,kind:'when',text:'Move'}],status:'draft',version:1,createdAt:0,updatedAt:0},tvId:id,platform:'webos',tvName:'Synthetic',status:'stopped',settling:true,startedAt:1,endedAt:2,revision:1,items:[{id,stepId:id,ordinal:1,phase:'awaiting_snapshot',delivery:{id,outcome:'sent'}}]} as TestRun;
 const saved={...run,settling:false,revision:2,items:[{...run.items[0]!,phase:'saved' as const,capturedAt:2,savedAt:3,cameraLabel:'Synthetic',bytes:1,sha256:'0'.repeat(64)}]};
 vi.spyOn(api,'getTestRun').mockResolvedValueOnce(run).mockResolvedValue(saved);
 render(<TestRunReport runId={id} initialRun={run} onBack={()=>{}} onNewRun={()=>{}} onSessionExpired={()=>{}}/>);
 await act(async()=>{});expect(screen.queryByText('Снимок сохранён')).toBeNull();
 await act(async()=>{await vi.advanceTimersByTimeAsync(2000);});expect(screen.getByText('Снимок сохранён')).toBeTruthy();
 fireEvent.error(screen.getByRole('img',{name:'Снимок 1: Move'}));expect(screen.getByRole('button',{name:'Повторить загрузку'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'}));await act(async()=>{});
 const image=screen.getByRole('img',{name:'Снимок 1: Move'});expect(image.getAttribute('src')).toContain('?retry=1');fireEvent.load(image);expect(screen.queryByRole('button',{name:'Повторить загрузку'})).toBeNull();
});

test('report opens the original case and shows saved OS version without a permanent refresh button',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const run={id,testCase:{id,title:'Synthetic',description:'',group:'',steps:[],status:'draft',version:1,createdAt:0,updatedAt:0},tvId:id,platform:'webos',tvName:'Synthetic',tvPlatformVersion:'6.5.3',status:'needs_review',startedAt:1,endedAt:2,revision:1,items:[]} as TestRun;
 vi.spyOn(api,'getTestRun').mockResolvedValue(run);const open=vi.fn();
 render(<TestRunReport runId={id} initialRun={run} onBack={()=>{}} onNewRun={()=>{}} onOpenCase={open} onSessionExpired={()=>{}}/>);
 const {fireEvent}=await import('@testing-library/react');
 fireEvent.click(screen.getByRole('button',{name:'Synthetic · v1'}));expect(open).toHaveBeenCalledWith(id);
 expect(screen.getByText(/Версия ОС: 6.5.3/)).toBeTruthy();expect(screen.queryByRole('button',{name:'Обновить отчёт'})).toBeNull();expect(screen.queryByRole('button',{name:'Повторить загрузку'})).toBeNull();
 await act(async()=>{});
});

 test('failed report request offers retry instead of a permanent refresh action',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const get=vi.spyOn(api,'getTestRun').mockRejectedValue(new Error('Synthetic failure'));
 render(<TestRunReport runId={id} onBack={()=>{}} onNewRun={()=>{}} onSessionExpired={()=>{}}/>);
 const retry=await screen.findByRole('button',{name:'Повторить загрузку'});
 expect(screen.queryByText('Загрузка отчёта…')).toBeNull();
 const {fireEvent}=await import('@testing-library/react');fireEvent.click(retry);
 await act(async()=>{});expect(get).toHaveBeenCalledTimes(2);
 });

test('failed OCR report shows expected labels and coverage without raw recognized text',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const run:TestRun={id,testCase:{id,title:'Synthetic',description:'',group:'',steps:[{id,kind:'then',text:'Профиль',textConditions:['Мое кино','Мои подписки']}],status:'draft',version:1,createdAt:0,updatedAt:0},tvId:id,platform:'webos',tvName:'Synthetic',status:'failed',startedAt:1,endedAt:2,revision:1,items:[{id,stepId:id,ordinal:1,phase:'saved',capturedAt:1,savedAt:2,verification:{status:'failed',conditions:[{expected:'Мое кино',found:true},{expected:'Мои подписки',found:false}],recognizedBlocks:[{text:'Мое кино'}],engine:'synthetic',model:'1',checkedAt:2,snapshotSha256:'0'.repeat(64)}}]};
 run.testCase.steps.unshift({id:'00000000-0000-4000-8000-000000000002',kind:'given',text:'Начало'});run.items.unshift({id:'00000000-0000-4000-8000-000000000003',stepId:run.testCase.steps[0]!.id,ordinal:1,phase:'saved',capturedAt:1,savedAt:1});
 vi.spyOn(api,'getTestRun').mockResolvedValue(run);
 render(<TestRunReport runId={id} initialRun={run} onBack={()=>{}} onNewRun={()=>{}} onSessionExpired={()=>{}}/>);
 expect(screen.getByText('Тест провален')).toBeTruthy();expect(screen.getByText('Мои подписки — не найдено')).toBeTruthy();expect(screen.getByText('Мое кино — найдено')).toBeTruthy();expect(screen.getByText(/Автоматические условия: 1 из 2/)).toBeTruthy();expect(screen.queryByText('Распознанный текст')).toBeNull();expect(screen.getByText('Условия не выполнены').closest('summary')?.getAttribute('data-status')).toBe('failed');
 await act(async()=>{});
});
