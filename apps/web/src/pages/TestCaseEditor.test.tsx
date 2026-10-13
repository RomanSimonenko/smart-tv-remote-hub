// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TestCaseEditor} from './TestCaseEditor.js';
afterEach(cleanup);
test('creates a draft with editable ordered steps and keeps values after a failed save',async()=>{
 const save=vi.fn().mockResolvedValue(false);
 render(<TestCaseEditor initialCase={null} onSave={save} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="Ошибка сохранения" onReloadConflict={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Название'),{target:{value:'Кейс'}});
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Дано'}));
 fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:'Открыт экран'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({title:'Кейс',steps:[expect.objectContaining({kind:'given',text:'Открыт экран'})]})));
 expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Кейс');
 expect(screen.getByRole('alert').textContent).toContain('Ошибка сохранения');
});
test('reorders steps, deletes and rejects empty text',async()=>{
 const save=vi.fn().mockResolvedValue(true);
 render(<TestCaseEditor initialCase={null} onSave={save} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Название'),{target:{value:'QA'}});
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Когда'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));expect(save).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:'Первый'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Когда'}));fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:'Второй'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 fireEvent.click(screen.getByRole('button',{name:'Поднять шаг 2 Когда'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({steps:[expect.objectContaining({text:'Второй'}),expect.objectContaining({text:'Первый'})]})));
 fireEvent.click(screen.getByRole('button',{name:'Удалить шаг 1 Когда'}));expect(screen.queryByText('Второй')).toBeNull();
});
test('identifies invalid title at its field',()=>{
 render(<TestCaseEditor initialCase={null} onSave={vi.fn()} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 const input=screen.getByLabelText('Название');const description=input.getAttribute('aria-describedby');
 expect(description).toBeTruthy();expect(document.getElementById(description!)?.textContent).toContain('Название');
});

test('keeps unapplied step edits and requires applying them before saving the case',async()=>{
 const save=vi.fn().mockResolvedValue(true);const dirty=vi.fn();
 render(<TestCaseEditor initialCase={null} onSave={save} onBack={vi.fn()} onDirtyChange={dirty} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Название'),{target:{value:'QA'}});
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Дано'}));
 fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:'Несохранённый текст'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));expect(save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Когда'}));
 fireEvent.click(screen.getAllByRole('button',{name:/Новый шаг/})[0]!);
 expect((screen.getByLabelText('Текст шага') as HTMLTextAreaElement).value).toBe('Несохранённый текст');
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 expect(screen.getByRole('status').textContent).toContain('черновик');
 expect(save).not.toHaveBeenCalled();expect(dirty).toHaveBeenLastCalledWith(true);
});

test('renders and moves across mixed step types without grouping',()=>{
 const steps=['given','when','then','when','then'].map((kind,i)=>({id:crypto.randomUUID(),kind:kind as 'given'|'when'|'then',text:`Текст ${i+1}`}));
 render(<TestCaseEditor initialCase={{id:crypto.randomUUID(),title:'Порядок',description:'',group:'',steps,status:'draft',version:1,createdAt:123,updatedAt:123}} onSave={vi.fn()} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 const rows=()=>screen.getAllByRole('button',{name:/Выбрать шаг/}).map(row=>row.textContent);
 expect(rows()).toEqual(steps.map((_,i)=>expect.stringContaining(`Текст ${i+1}`)));
 fireEvent.click(screen.getByRole('button',{name:'Поднять шаг 4 Когда'}));
 expect(rows()[2]).toContain('Текст 4');expect(rows()[3]).toContain('Текст 3');
});

test('inserts between different types, retains staged type and text, cancels with focus return',async()=>{
 const save=vi.fn().mockResolvedValue(true);
 render(<TestCaseEditor initialCase={null} onSave={save} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Название'),{target:{value:'Последовательность'}});
 const add=(kind:string,text:string)=>{fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:`Добавить шаг ${kind}`}));fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:text}});fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));};
 add('Дано','Начало');add('Тогда','Результат');
 const trigger=screen.getByRole('button',{name:'Вставить шаг после №1'});fireEvent.click(trigger);
 fireEvent.keyDown(screen.getByRole('button',{name:'Добавить шаг Когда'}),{key:'Escape'});expect(document.activeElement).toBe(trigger);expect(screen.queryByRole('button',{name:'Добавить шаг Когда'})).toBeNull();
 fireEvent.click(trigger);fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Когда'}));
 fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:'Действие'}});fireEvent.change(screen.getByLabelText('Тип шага'),{target:{value:'then'}});
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 2/}));
 expect((screen.getByLabelText('Тип шага') as HTMLSelectElement).value).toBe('then');expect((screen.getByLabelText('Текст шага') as HTMLTextAreaElement).value).toBe('Действие');
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));expect(save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({steps:[expect.objectContaining({text:'Начало',kind:'given'}),expect.objectContaining({text:'Действие',kind:'then'}),expect.objectContaining({text:'Результат',kind:'then'})]})));
});

test('protects unapplied edits when deleting and selects the next step',()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<TestCaseEditor initialCase={null} onSave={vi.fn()} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 for(const kind of ['Дано','Когда']){fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:`Добавить шаг ${kind}`}));}
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:'Правка'}});
 fireEvent.click(screen.getByRole('button',{name:'Удалить шаг 1 Дано'}));expect(screen.getAllByRole('button',{name:/Выбрать шаг/})).toHaveLength(2);
 confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Удалить шаг 1 Дано'}));expect((screen.getByLabelText('Тип шага') as HTMLSelectElement).value).toBe('when');
 fireEvent.click(screen.getByRole('button',{name:'Удалить шаг 1 Когда'}));expect(screen.queryByLabelText('Текст шага')).toBeNull();confirm.mockRestore();
});

test('closing parameters retains unapplied edits and returns focus to the step',()=>{
 render(<TestCaseEditor initialCase={null} onSave={vi.fn()} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Дано'}));
 fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:'Неприменённый текст'}});
 fireEvent.click(screen.getByRole('button',{name:'Закрыть параметры шага'}));
 expect(screen.queryByLabelText('Текст шага')).toBeNull();const row=screen.getByRole('button',{name:/Выбрать шаг 1/});expect(document.activeElement).toBe(row);
 fireEvent.click(row);expect((screen.getByLabelText('Текст шага') as HTMLTextAreaElement).value).toBe('Неприменённый текст');
});

test('saved case wins over a retained imported draft after conflict reload',()=>{
 const initialCase={id:'00000000-0000-4000-8000-000000000001',title:'Server title',description:'Server description',group:'',steps:[],status:'draft' as const,version:2,createdAt:1,updatedAt:2};
 render(<TestCaseEditor initialCase={initialCase} initialDraft={{title:'Old import',description:'',group:'',steps:[]}} onSave={vi.fn()} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Server title');
});
test('forwards pending step validation to the leave dialog and clears it after applying',()=>{
 const report=vi.fn();render(<TestCaseEditor initialCase={null} onValidationError={report} onSave={vi.fn()} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Название'),{target:{value:'Demo'}});
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Дано'}));
 fireEvent.change(screen.getByLabelText('Текст шага'),{target:{value:'Changed'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 expect(report).toHaveBeenLastCalledWith('Сначала нажмите «Сохранить шаг» для изменённых шагов.');
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));expect(report).toHaveBeenLastCalledWith('');
});
