// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TestCases} from './TestCases.js';
afterEach(cleanup);
const item={id:'00000000-0000-4000-8000-000000000001',title:'Каналы',description:'Поиск',group:'ТВ',steps:[],version:2,status:'draft' as const,createdAt:1,updatedAt:1};
test('filters by description and group and opens a case',()=>{
 const open=vi.fn(); render(<TestCases cases={[item,{...item,id:'other',title:'Плеер',description:'Видео',group:'Видео'}]} loading={false} error="" onCreate={vi.fn()} onOpen={open} onRetry={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Поиск тест-кейсов'),{target:{value:'поиск'}});
 expect(screen.queryByRole('button',{name:'Плеер'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Каналы'})); expect(open).toHaveBeenCalledWith(item.id);
 expect(screen.getByText('v2')).toBeTruthy();
});

test('opens a case by clicking any cell and by keyboard on the whole row',()=>{
 const open=vi.fn();render(<TestCases cases={[item]} loading={false} error="" onCreate={vi.fn()} onOpen={open} onRetry={vi.fn()}/>);
 const row=screen.getByText('v2').closest('tr')!;expect(row.tabIndex).toBe(0);
 fireEvent.click(screen.getByText('v2'));fireEvent.keyDown(row,{key:'Enter'});fireEvent.keyDown(row,{key:' '});
 expect(open).toHaveBeenCalledTimes(3);
 expect(screen.getAllByRole('button',{name:'Каналы'})[0]!.tabIndex).toBe(-1);
});
