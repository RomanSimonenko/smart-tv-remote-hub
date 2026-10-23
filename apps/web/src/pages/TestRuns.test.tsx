import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {TestRuns} from './TestRuns.js';
import {api} from '../api.js';
let intersect:(()=>void)|undefined;
beforeEach(()=>{
 intersect=undefined;
 vi.spyOn(api,'tvDevices').mockResolvedValue({devices:[]});
 vi.stubGlobal('IntersectionObserver',class {
  constructor(callback:IntersectionObserverCallback){intersect=()=>callback([{isIntersecting:true}] as IntersectionObserverEntry[],this as unknown as IntersectionObserver);}
  observe(){} disconnect(){}
 });
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
const run=(id:string)=>({id,caseId:'case',caseTitle:`Запуск ${id}`,caseVersion:1,tvId:'tv',platform:'webos' as const,tvName:'Тестовый ТВ',startedAt:1000,status:'passed' as const,savedCount:1,itemCount:1,revision:0});
test('scroll loads the next page once and preserves rows without manual controls',async()=>{
 let finish!:(value:{runs:ReturnType<typeof run>[];next:null})=>void;
 const list=vi.spyOn(api,'listTestRuns').mockResolvedValueOnce({runs:[run('1')],next:'page2'}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 render(<TestRuns onOpen={()=>{}} onSessionExpired={()=>{}}/>);
 await screen.findByText('Запуск 1 · v1');
 expect(screen.queryByRole('button',{name:'Обновить'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Загрузить ещё'})).toBeNull();
 await waitFor(()=>expect(intersect).toBeTypeOf('function'));
 act(()=>{intersect!();intersect!();});
 await waitFor(()=>expect(list).toHaveBeenCalledTimes(2));
 expect(list.mock.calls[1]?.[0]).toBe('page2');
 expect(screen.getByText('Запуск 1 · v1')).toBeTruthy();
 await act(async()=>finish({runs:[run('1'),run('2')],next:null}));
 expect(screen.getAllByText('Запуск 1 · v1')).toHaveLength(1);
 expect(screen.getByText('Запуск 2 · v1')).toBeTruthy();
 expect(document.querySelector('.runs-load-sentinel')).toBeNull();
});
test('filtered empty results offer reset and restore unfiltered history',async()=>{
 const list=vi.spyOn(api,'listTestRuns').mockResolvedValue({runs:[],next:null});
 render(<TestRuns onOpen={()=>{}} onSessionExpired={()=>{}}/>);
 await screen.findByText('Запусков пока нет');
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'missing'}});
 await screen.findByText('Ничего не найдено');
 fireEvent.click(screen.getByRole('button',{name:'Сбросить фильтры'}));
 await screen.findByText('Запусков пока нет');
 await waitFor(()=>expect(list.mock.calls.at(-1)?.[2]?.query).toBe(''));
});
test('page failure keeps rows and supports explicit retry without an automatic retry loop',async()=>{
 const list=vi.spyOn(api,'listTestRuns').mockResolvedValueOnce({runs:[run('1')],next:'page2'}).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({runs:[run('2')],next:null});
 render(<TestRuns onOpen={()=>{}} onSessionExpired={()=>{}}/>);
 await screen.findByText('Запуск 1 · v1');
 await waitFor(()=>expect(intersect).toBeTypeOf('function'));
 act(()=>intersect!());
 await screen.findByRole('alert');
 expect(screen.getByText('Запуск 1 · v1')).toBeTruthy();
 expect(list).toHaveBeenCalledTimes(2);
 fireEvent.click(screen.getByRole('button',{name:'Повторить'}));
 await screen.findByText('Запуск 2 · v1');
 expect(screen.getByText('Запуск 1 · v1')).toBeTruthy();
 expect(list.mock.calls[2]?.[0]).toBe('page2');
});
