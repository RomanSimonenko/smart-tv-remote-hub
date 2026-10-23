// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {TestCaseEditor} from './TestCaseEditor.js';
beforeEach(()=>Object.defineProperties(HTMLDialogElement.prototype,{
 showModal:{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}},
 close:{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}},
}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function setup(){
 const save=vi.fn().mockResolvedValue(true),id=crypto.randomUUID();
 const step={id,kind:'when' as const,text:'Открыть каталог',actions:[{id:crypto.randomUUID(),action:'RIGHT' as const,pauseAfterMs:500}]};
 render(<TestCaseEditor initialCase={{id:crypto.randomUUID(),title:'Synthetic',description:'',group:'',steps:[step],version:1,status:'draft',createdAt:1,updatedAt:1}} onSave={save} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));return {save,step};
}
test('uses one dialog and the existing remote to append repeated independent actions directly',()=>{
 const {save}=setup(),dialog=screen.getByRole('dialog',{name:'Параметры шага 1'});
 expect(screen.getAllByRole('dialog')).toHaveLength(1);const remote=within(dialog).getByRole('group',{name:'Пульт'});
 fireEvent.click(within(remote).getByRole('button',{name:'Вправо'}));fireEvent.click(within(remote).getByRole('button',{name:'Вправо'}));
 expect(within(dialog).getAllByLabelText(/Пауза после нажатия \d, мс/)).toHaveLength(3);
 expect(save).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 expect(screen.queryByRole('dialog')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 const actions=save.mock.calls[0]![0].steps[0].actions;expect(actions).toHaveLength(3);expect(new Set(actions.map((a:{id:string})=>a.id)).size).toBe(3);expect(actions.map((a:{pauseAfterMs:number})=>a.pauseAfterMs)).toEqual([500,500,500]);
});
test('closing edited step protects its local values and discards only after confirmation',()=>{
 setup();fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Изменённый текст'}});
 fireEvent.click(screen.getByRole('button',{name:'Закрыть параметры шага'}));expect(screen.getByText('Изменения шага не применены. Закрыть без сохранения?')).toBeTruthy();expect(screen.getAllByRole('dialog')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Продолжить редактирование'}));expect((screen.getByLabelText('Описание шага') as HTMLTextAreaElement).value).toBe('Изменённый текст');
 fireEvent.click(screen.getByRole('button',{name:'Отмена'}));fireEvent.click(screen.getByRole('button',{name:'Не сохранять и закрыть'}));
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));expect((screen.getByLabelText('Описание шага') as HTMLTextAreaElement).value).toBe('Открыть каталог');
});
test('cancelling a new empty step removes its temporary row and restores its insertion trigger',async()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Отмена'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Тогда'}));
 fireEvent.click(screen.getByRole('button',{name:'Отмена'}));expect(screen.getAllByRole('button',{name:/Выбрать шаг/})).toHaveLength(1);
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'Добавить шаг'})));
});
test('invalid pause remains visible inside dialog and prevents applying',()=>{
 const {save}=setup();fireEvent.change(screen.getByLabelText('Пауза после нажатия 1, мс'),{target:{value:'60001'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByRole('alert').textContent).toContain('Пауза');expect(save).not.toHaveBeenCalled();
});
test('remote can be hidden without losing rows and clean Escape returns focus to the step',async()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Скрыть пульт'}));expect(screen.queryByRole('group',{name:'Пульт'})).toBeNull();expect(screen.getByLabelText('Пауза после нажатия 1, мс')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Добавить нажатия'}));expect(screen.getByRole('group',{name:'Пульт'})).toBeTruthy();
 fireEvent(screen.getByRole('dialog'),new Event('cancel',{bubbles:true,cancelable:true}));await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:/Выбрать шаг 1/})));
});
