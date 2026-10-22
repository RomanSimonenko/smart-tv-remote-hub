import {cleanup,render,screen,waitFor} from '@testing-library/react';import {afterEach,expect,test,vi} from 'vitest';
import {TestRunner} from './TestRunner.js';import {api} from '../api.js';
import type {TestRun} from '@remote-webos-tv/contracts';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test('updates completed step checks during execution and waits for every action and OCR',async()=>{
 const execution=await import('../useTestRun.js');
 const id=crypto.randomUUID(),first=crypto.randomUUID(),second=crypto.randomUUID(),third=crypto.randomUUID();
 const actions=[{id:crypto.randomUUID(),action:'RIGHT' as const,pauseAfterMs:0},{id:crypto.randomUUID(),action:'ENTER' as const,pauseAfterMs:0}];
 let run:TestRun={id,testCase:{id,title:'Synthetic live progress',description:'',group:'',status:'ready',version:1,createdAt:1,updatedAt:1,steps:[{id:first,kind:'when',text:'Два действия',actions},{id:second,kind:'then',text:'Проверка текста',textConditions:['Каталог']},{id:third,kind:'then',text:'Следующий шаг'}]},tvId:id,platform:'webos',tvName:'Synthetic',status:'running',startedAt:1,revision:1,items:[{id:crypto.randomUUID(),stepId:first,ordinal:1,action:actions[0]!,phase:'saved'},{id:crypto.randomUUID(),stepId:first,ordinal:2,action:actions[1]!,phase:'awaiting_snapshot'},{id:crypto.randomUUID(),stepId:second,ordinal:3,phase:'pending'},{id:crypto.randomUUID(),stepId:third,ordinal:4,phase:'pending'}]};
 vi.spyOn(execution,'useTestRun').mockImplementation(()=>({run,busy:true,error:'',start:vi.fn(),stop:vi.fn(),reset:vi.fn()}));
 vi.spyOn(api,'getTestCase').mockResolvedValue(run.testCase);vi.spyOn(api,'tvDevices').mockResolvedValue({devices:[]});
 const props={caseId:id,csrfToken:'synthetic',onSessionExpired:()=>{},onBack:()=>{},onOpenRuns:()=>{},onRunningChange:()=>{}};
 const view=render(<TestRunner {...props}/>);
 expect(view.container.querySelectorAll('.runner-steps [data-status=completed]')).toHaveLength(0);
 expect(screen.getByLabelText('Выполняется').classList.contains('run-spinner')).toBe(true);
 run={...run,revision:2,items:run.items.map((item,index)=>index===1?{...item,phase:'saved'}:index===2?{...item,phase:'saved',verificationState:'running'}:item)};
 view.rerender(<TestRunner {...props}/>);
 expect(screen.getByLabelText('Шаг выполнен')).toBeTruthy();
 expect(view.container.querySelectorAll('.runner-steps [data-status=passed]')).toHaveLength(0);
 expect(screen.getByLabelText('Выполняется')).toBeTruthy();
 run={...run,revision:3,items:run.items.map((item,index)=>{if(index!==2)return item;const {verificationState:_,...saved}=item;return {...saved,verification:{status:'passed',conditions:[{expected:'Каталог',found:true}],recognizedBlocks:[],engine:'synthetic',model:'1',checkedAt:2,snapshotSha256:'0'.repeat(64)}};})};
 view.rerender(<TestRunner {...props}/>);
 expect(screen.getByLabelText('Условия выполнены')).toBeTruthy();
 expect(screen.getByRole('heading',{name:'Выполнение теста'})).toBeTruthy();
 await waitFor(()=>expect(screen.getByText(/Synthetic live progress/)).toBeTruthy());
});
test('preparation loads saved case and cannot start before live camera and TV readiness',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 vi.spyOn(api,'getTestCase').mockResolvedValue({id,title:'Synthetic',description:'',group:'',status:'draft',version:1,createdAt:1,updatedAt:1,steps:[{id,kind:'given',text:'Начальное состояние'}]});
 vi.spyOn(api,'tvDevices').mockResolvedValue({devices:[{tvId:id,platform:'webos',status:{tv:{host:'192.0.2.10',identity:{model:'Synthetic TV',platformVersion:'6.5.3'}},connection:'unavailable',operation:null}}]});
 render(<TestRunner caseId={id} csrfToken="synthetic" onSessionExpired={()=>{}} onBack={()=>{}} onOpenRuns={()=>{}} onRunningChange={()=>{}}/>);
 await waitFor(()=>expect(screen.getByText(/^Synthetic · v/)).toBeTruthy());
 expect(screen.getByRole('option',{name:'Synthetic TV · webOS 6.5.3'})).toBeTruthy();expect(screen.queryByText('Камера и ТВ готовы. Можно начинать.')).toBeNull();expect(screen.getByText('Начальное состояние')).toBeTruthy();expect((screen.getByRole('button',{name:'Начать тест'}) as HTMLButtonElement).disabled).toBe(true);
});

test('completed runner report uses history navigation instead of the preparation back action',async()=>{
 const execution=await import('../useTestRun.js');
 const id='00000000-0000-4000-8000-000000000001';
 const scenario={id,title:'Synthetic',description:'',group:'',status:'ready' as const,version:1,createdAt:1,updatedAt:1,steps:[]};
 const run={id,testCase:scenario,tvId:id,platform:'webos' as const,tvName:'Synthetic',status:'needs_review' as const,startedAt:1,endedAt:2,revision:1,items:[]};
 vi.spyOn(execution,'useTestRun').mockReturnValue({run,busy:false,error:'',start:vi.fn(),stop:vi.fn(),reset:vi.fn()});
 vi.spyOn(api,'getTestCase').mockResolvedValue(scenario);vi.spyOn(api,'getTestRun').mockResolvedValue(run);vi.spyOn(api,'tvDevices').mockResolvedValue({devices:[]});
 const back=vi.fn(),history=vi.fn();
 render(<TestRunner caseId={id} csrfToken="synthetic" onSessionExpired={()=>{}} onBack={back} onOpenRuns={history} onRunningChange={()=>{}}/>);
 const {fireEvent}=await import('@testing-library/react');
 fireEvent.click(screen.getByRole('button',{name:'Запуски'}));
 expect(history).toHaveBeenCalledOnce();expect(back).not.toHaveBeenCalled();
});
