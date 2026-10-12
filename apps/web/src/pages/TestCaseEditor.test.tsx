// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TestCaseEditor} from './TestCaseEditor.js';
afterEach(cleanup);
test('creates a draft with editable ordered steps and keeps values after a failed save',async()=>{
 const save=vi.fn().mockResolvedValue(false);
 render(<TestCaseEditor initialCase={null} onSave={save} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="Ошибка сохранения" onReloadConflict={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Название'),{target:{value:'Кейс'}});
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Дано'}));
 fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:'Открыт экран'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({title:'Кейс',steps:[expect.objectContaining({kind:'given',text:'Открыт экран'})]})));
 expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Кейс');
 expect(screen.getByRole('alert').textContent).toContain('Ошибка сохранения');
});
test('reorders steps within a block, deletes and rejects empty text',async()=>{
 const save=vi.fn().mockResolvedValue(true);
 render(<TestCaseEditor initialCase={null} onSave={save} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Название'),{target:{value:'QA'}});
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Когда'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));expect(save).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:'Первый'}});
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Когда'}));fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:'Второй'}});
 fireEvent.click(screen.getByRole('button',{name:'Поднять шаг 2 Когда'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({steps:[expect.objectContaining({text:'Второй'}),expect.objectContaining({text:'Первый'})]})));
 fireEvent.click(screen.getByRole('button',{name:'Удалить шаг 1 Когда'}));expect(screen.queryByText('Второй')).toBeNull();
});
test('identifies invalid title at its field',()=>{
 render(<TestCaseEditor initialCase={null} onSave={vi.fn()} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
 const input=screen.getByLabelText('Название');const description=input.getAttribute('aria-describedby');
 expect(description).toBeTruthy();expect(document.getElementById(description!)?.textContent).toContain('Название');
});
