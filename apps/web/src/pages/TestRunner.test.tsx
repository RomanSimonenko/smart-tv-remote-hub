import {cleanup,render,screen,waitFor} from '@testing-library/react';import {afterEach,expect,test,vi} from 'vitest';
import {TestRunner} from './TestRunner.js';import {api} from '../api.js';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
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
