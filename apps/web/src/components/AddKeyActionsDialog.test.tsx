import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {AddKeyActionsDialog} from './AddKeyActionsDialog.js';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
beforeEach(()=>{
 Object.defineProperties(HTMLDialogElement.prototype,{
  showModal:{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}},
  close:{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}},
 });
});
test('collects repeated presses locally and applies the whole queue with default pauses',()=>{
 const apply=vi.fn(),close=vi.fn(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 render(<AddKeyActionsDialog remaining={200} onApply={apply} onClose={close}/>);
 expect((screen.getByRole('button',{name:/Готово/}) as HTMLButtonElement).disabled).toBe(true);
 for(const key of ['Вправо','Вправо','OK'])fireEvent.click(screen.getByRole('button',{name:key}));
 expect(screen.getByRole('dialog')).toBeTruthy();expect(apply).not.toHaveBeenCalled();
 expect(within(screen.getByRole('list',{name:'Добавляемые нажатия'})).getAllByRole('listitem')).toHaveLength(3);
 fireEvent.click(screen.getByRole('button',{name:/Готово/}));
 expect(apply).toHaveBeenCalledWith([expect.objectContaining({action:'RIGHT',pauseAfterMs:500}),expect.objectContaining({action:'RIGHT',pauseAfterMs:500}),expect.objectContaining({action:'ENTER',pauseAfterMs:500})]);
 expect(new Set(apply.mock.calls[0]![0].map((item:{id:string})=>item.id)).size).toBe(3);
 expect(fetch).not.toHaveBeenCalled();expect(close).toHaveBeenCalledTimes(1);
});
test('respects remaining capacity, removes errors and cancels without applying',()=>{
 const apply=vi.fn(),close=vi.fn();render(<AddKeyActionsDialog remaining={2} onApply={apply} onClose={close}/>);
 fireEvent.click(screen.getByRole('button',{name:'Питание'}));fireEvent.click(screen.getByRole('button',{name:'Запустить Wink'}));
 expect((screen.getByRole('button',{name:'Вправо'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByRole('status').textContent).toContain('200');
 fireEvent.click(screen.getByRole('button',{name:'Удалить добавляемое нажатие 1'}));
 expect((screen.getByRole('button',{name:'Вправо'}) as HTMLButtonElement).disabled).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Отмена'}));expect(close).toHaveBeenCalledTimes(1);expect(apply).not.toHaveBeenCalled();
});
test('Escape, close and backdrop do not accidentally append or send Back',()=>{
 const close=vi.fn(),apply=vi.fn();render(<AddKeyActionsDialog remaining={200} onApply={apply} onClose={close}/>);
 fireEvent.click(screen.getByRole('button',{name:'Вправо'}));
 const dialog=screen.getByRole('dialog');fireEvent.click(dialog,{clientX:-1,clientY:-1});expect(close).not.toHaveBeenCalled();
 fireEvent(dialog,new Event('cancel',{cancelable:true}));expect(close).toHaveBeenCalledTimes(1);expect(apply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Закрыть добавление нажатий'}));expect(close).toHaveBeenCalledTimes(2);
 expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
});
