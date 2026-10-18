import {act,cleanup,render,screen,fireEvent} from '@testing-library/react';import {afterEach,expect,test,vi} from 'vitest';
import {TestRunReport} from './TestRunReport.js';import {api} from '../api.js';import type {TestRun} from '@remote-webos-tv/contracts';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
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

test('failed OCR report shows each expected label, recognition evidence and coverage',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const run:TestRun={id,testCase:{id,title:'Synthetic',description:'',group:'',steps:[{id,kind:'then',text:'Профиль',textConditions:['Мое кино','Мои подписки']}],status:'draft',version:1,createdAt:0,updatedAt:0},tvId:id,platform:'webos',tvName:'Synthetic',status:'failed',startedAt:1,endedAt:2,revision:1,items:[{id,stepId:id,ordinal:1,phase:'saved',capturedAt:1,savedAt:2,verification:{status:'failed',conditions:[{expected:'Мое кино',found:true},{expected:'Мои подписки',found:false}],recognizedBlocks:[{text:'Мое кино'}],engine:'synthetic',model:'1',checkedAt:2,snapshotSha256:'0'.repeat(64)}}]};
 run.testCase.steps.unshift({id:'00000000-0000-4000-8000-000000000002',kind:'given',text:'Начало'});run.items.unshift({id:'00000000-0000-4000-8000-000000000003',stepId:run.testCase.steps[0]!.id,ordinal:1,phase:'saved',capturedAt:1,savedAt:1});
 vi.spyOn(api,'getTestRun').mockResolvedValue(run);
 render(<TestRunReport runId={id} initialRun={run} onBack={()=>{}} onNewRun={()=>{}} onSessionExpired={()=>{}}/>);
 expect(screen.getByText('Тест провален')).toBeTruthy();expect(screen.getByText('Мои подписки — не найдено')).toBeTruthy();expect(screen.getByText('Мое кино — найдено')).toBeTruthy();expect(screen.getByText(/Автоматические условия: 1 из 2/)).toBeTruthy();
 await act(async()=>{});
});
