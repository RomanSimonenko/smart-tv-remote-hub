import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TestRuns} from './TestRuns.js';
import {api} from '../api.js';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
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
