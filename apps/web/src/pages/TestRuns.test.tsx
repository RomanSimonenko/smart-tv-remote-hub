import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TestRuns} from './TestRuns.js';
import {api} from '../api.js';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test('refresh keeps loaded content and reports progress in the refresh action',async()=>{
 vi.spyOn(api,'tvDevices').mockResolvedValue({devices:[]});
 let finish!:(value:{runs:[];next:null})=>void;
 vi.spyOn(api,'listTestRuns').mockResolvedValueOnce({runs:[],next:null}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 render(<TestRuns onOpen={()=>{}} onSessionExpired={()=>{}}/>);
 expect(screen.getByText('Загрузка запусков…')).toBeTruthy();
 await screen.findByText('Запусков пока нет');
 fireEvent.click(screen.getByRole('button',{name:'Обновить'}));
 expect(screen.queryByText('Загрузка запусков…')).toBeNull();
 expect(screen.getByText('Запусков пока нет')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Обновить'}).getAttribute('aria-busy')).toBe('true');
 await act(async()=>finish({runs:[],next:null}));
 expect(screen.getByRole('button',{name:'Обновить'}).getAttribute('aria-busy')).toBe('false');
});
test('filtered empty results offer reset and restore unfiltered history',async()=>{
 vi.spyOn(api,'tvDevices').mockResolvedValue({devices:[]});
 const list=vi.spyOn(api,'listTestRuns').mockResolvedValue({runs:[],next:null});
 render(<TestRuns onOpen={()=>{}} onSessionExpired={()=>{}}/>);
 await screen.findByText('Запусков пока нет');
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'missing'}});
 await screen.findByText('Ничего не найдено');
 expect(screen.queryByText('Запусков пока нет')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Сбросить фильтры'}));
 await screen.findByText('Запусков пока нет');
 await waitFor(()=>expect(list.mock.calls.at(-1)?.[2]?.query).toBe(''));
});

test('failed refresh keeps loaded content and shows a specific error',async()=>{
 vi.spyOn(api,'tvDevices').mockResolvedValue({devices:[]});
 vi.spyOn(api,'listTestRuns').mockResolvedValueOnce({runs:[],next:null}).mockRejectedValueOnce(new Error('network'));
 render(<TestRuns onOpen={()=>{}} onSessionExpired={()=>{}}/>);
 await screen.findByText('Запусков пока нет');
 fireEvent.click(screen.getByRole('button',{name:'Обновить'}));
 expect(await screen.findByRole('alert')).toBeTruthy();
 expect(screen.getByText('Запусков пока нет')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Обновить'})).toHaveProperty('disabled',false);
});
