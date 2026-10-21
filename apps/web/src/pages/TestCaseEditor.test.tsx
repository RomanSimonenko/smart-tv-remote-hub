// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TestCaseEditor} from './TestCaseEditor.js';
afterEach(cleanup);
test('duplicates a step immediately after its source with independent actions and focuses its text',async()=>{
 const source={id:crypto.randomUUID(),kind:'when' as const,text:'Открыть каталог',actions:[{id:crypto.randomUUID(),action:'RIGHT' as const,pauseAfterMs:0},{id:crypto.randomUUID(),action:'ENTER' as const,pauseAfterMs:1000}]};
 const last={id:crypto.randomUUID(),kind:'then' as const,text:'Каталог открыт'};
 const save=vi.fn().mockResolvedValue(true),dirty=vi.fn();
 render(<TestCaseEditor initialDraft={{title:'Копирование',description:'',group:'',steps:[source,last]}} initialCase={null} onSave={save} onBack={vi.fn()} onDirtyChange={dirty} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Дублировать шаг 1 Когда'}));
 expect(screen.getByRole('button',{name:'Выбрать шаг 2 Когда: Открыть каталог'}).getAttribute('aria-pressed')).toBe('true');
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByLabelText('Описание шага')));
 expect(dirty).toHaveBeenLastCalledWith(true);
 fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Открыть другой каталог'}});
 fireEvent.change(screen.getByLabelText('Пауза после нажатия 1, мс'),{target:{value:'200'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 await waitFor(()=>expect(save).toHaveBeenCalledOnce());
 const steps=save.mock.calls[0]![0].steps;
 expect(steps).toEqual([source,expect.objectContaining({kind:'when',text:'Открыть другой каталог',actions:[expect.objectContaining({action:'RIGHT',pauseAfterMs:200}),expect.objectContaining({action:'ENTER',pauseAfterMs:1000})]}),last]);
 expect(steps[1].id).not.toBe(source.id);
 expect(steps[1].actions.map((action:{id:string})=>action.id).every((id:string)=>!source.actions.some(action=>action.id===id))).toBe(true);
});

test('duplicates current unapplied values while retaining the original pending edits',async()=>{
 const source={id:crypto.randomUUID(),kind:'when' as const,text:'Исходный текст',actions:[{id:crypto.randomUUID(),action:'ENTER' as const,pauseAfterMs:500}]};
 const save=vi.fn().mockResolvedValue(true);
 render(<TestCaseEditor initialDraft={{title:'Правки',description:'',group:'',steps:[source]}} initialCase={null} onSave={save} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));
 fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Текущий текст'}});
 fireEvent.change(screen.getByLabelText('Тип шага'),{target:{value:'then'}});
 fireEvent.change(screen.getByLabelText('Пауза после нажатия 1, мс'),{target:{value:'0'}});
 fireEvent.click(screen.getByRole('button',{name:'Дублировать шаг 1 Когда'}));
 expect((screen.getByLabelText('Описание шага') as HTMLTextAreaElement).value).toBe('Текущий текст');
 expect((screen.getByLabelText('Тип шага') as HTMLSelectElement).value).toBe('then');
 expect((screen.getByLabelText('Пауза после нажатия 1, мс') as HTMLInputElement).value).toBe('0');
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));expect(save).not.toHaveBeenCalled();
 expect((screen.getByLabelText('Описание шага') as HTMLTextAreaElement).value).toBe('Текущий текст');
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({steps:[expect.objectContaining({id:source.id,kind:'then',text:'Текущий текст'}),expect.objectContaining({kind:'then',text:'Текущий текст',actions:[expect.objectContaining({action:'ENTER',pauseAfterMs:0})]})]})));
});

test('duplicates an empty step without actions and disables duplication at the limit and during saving',()=>{
 const draft={title:'Лимит',description:'',group:'',steps:[{id:crypto.randomUUID(),kind:'given' as const,text:''}]};
 const props={initialCase:null,onSave:vi.fn(),onBack:vi.fn(),onDirtyChange:vi.fn(),error:'',onReloadConflict:vi.fn()};
 const view=render(<TestCaseEditor {...props} initialDraft={draft} saving={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'Дублировать шаг 1 Дано'}));
 expect(screen.getAllByRole('button',{name:/Выбрать шаг/})).toHaveLength(2);
 expect((screen.getByLabelText('Описание шага') as HTMLTextAreaElement).value).toBe('');
 view.rerender(<TestCaseEditor {...props} initialDraft={draft} saving={true}/>);
 expect(screen.getByRole('button',{name:'Дублировать шаг 1 Дано'}).matches(':disabled')).toBe(true);
 view.unmount();
 const steps=Array.from({length:199},()=>({id:crypto.randomUUID(),kind:'given' as const,text:'Шаг'}));
 render(<TestCaseEditor {...props} initialDraft={{...draft,steps}} saving={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'Дублировать шаг 199 Дано'}));
 expect(screen.getAllByRole('button',{name:/Выбрать шаг/})).toHaveLength(200);
 expect(screen.getAllByRole('button',{name:/Дублировать шаг/}).every(button=>button.matches(':disabled'))).toBe(true);
});
test('creates a draft with editable ordered steps and keeps values after a failed save',async()=>{
 const save=vi.fn().mockResolvedValue(false);
 render(<TestCaseEditor initialCase={null} onSave={save} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="Ошибка сохранения" onReloadConflict={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Название'),{target:{value:'Кейс'}});
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Дано'}));
 fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Открыт экран'}});
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
 fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Первый'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Когда'}));fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Второй'}});
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
 fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Несохранённый текст'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));expect(save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Когда'}));
 fireEvent.click(screen.getAllByRole('button',{name:/Новый шаг/})[0]!);
 expect((screen.getByLabelText('Описание шага') as HTMLTextAreaElement).value).toBe('Несохранённый текст');
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
 const add=(kind:string,text:string)=>{fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:`Добавить шаг ${kind}`}));fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:text}});fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));};
 add('Дано','Начало');add('Тогда','Результат');
 const trigger=screen.getByRole('button',{name:'Вставить шаг после №1'});fireEvent.click(trigger);
 fireEvent.keyDown(screen.getByRole('button',{name:'Добавить шаг Когда'}),{key:'Escape'});expect(document.activeElement).toBe(trigger);expect(screen.queryByRole('button',{name:'Добавить шаг Когда'})).toBeNull();
 fireEvent.click(trigger);fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Когда'}));
 fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Действие'}});fireEvent.change(screen.getByLabelText('Тип шага'),{target:{value:'then'}});
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 2/}));
 expect((screen.getByLabelText('Тип шага') as HTMLSelectElement).value).toBe('then');expect((screen.getByLabelText('Описание шага') as HTMLTextAreaElement).value).toBe('Действие');
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));expect(save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({steps:[expect.objectContaining({text:'Начало',kind:'given'}),expect.objectContaining({text:'Действие',kind:'then'}),expect.objectContaining({text:'Результат',kind:'then'})]})));
});

test('protects unapplied edits when deleting and selects the next step',()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<TestCaseEditor initialCase={null} onSave={vi.fn()} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 for(const kind of ['Дано','Когда']){fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:`Добавить шаг ${kind}`}));}
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Правка'}});
 fireEvent.click(screen.getByRole('button',{name:'Удалить шаг 1 Дано'}));expect(screen.getAllByRole('button',{name:/Выбрать шаг/})).toHaveLength(2);
 confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Удалить шаг 1 Дано'}));expect((screen.getByLabelText('Тип шага') as HTMLSelectElement).value).toBe('when');
 fireEvent.click(screen.getByRole('button',{name:'Удалить шаг 1 Когда'}));expect(screen.queryByLabelText('Описание шага')).toBeNull();confirm.mockRestore();
});

test('closing parameters retains unapplied edits and returns focus to the step',()=>{
 render(<TestCaseEditor initialCase={null} onSave={vi.fn()} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Дано'}));
 fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Неприменённый текст'}});
 fireEvent.click(screen.getByRole('button',{name:'Закрыть параметры шага'}));
 expect(screen.queryByLabelText('Описание шага')).toBeNull();const row=screen.getByRole('button',{name:/Выбрать шаг 1/});expect(document.activeElement).toBe(row);
 fireEvent.click(row);expect((screen.getByLabelText('Описание шага') as HTMLTextAreaElement).value).toBe('Неприменённый текст');
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
 fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Changed'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 expect(report).toHaveBeenLastCalledWith('Сначала нажмите «Сохранить шаг» для изменённых шагов.');
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));expect(report).toHaveBeenLastCalledWith('');
});

test('stages key-only edits by step identity and persists sequence only after saving the step',async()=>{
 Object.defineProperties(HTMLDialogElement.prototype,{showModal:{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}},close:{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}}});
 const save=vi.fn().mockResolvedValue(true),dirty=vi.fn();
 const steps=[{id:'00000000-0000-4000-8000-000000000011',kind:'when' as const,text:'Каталог'},{id:'00000000-0000-4000-8000-000000000012',kind:'then' as const,text:'Результат'}];
 const initialCase={id:'00000000-0000-4000-8000-000000000010',title:'Пульт',description:'',group:'',steps,status:'draft' as const,version:1,createdAt:1,updatedAt:1};
 render(<TestCaseEditor initialCase={initialCase} onSave={save} onBack={vi.fn()} onDirtyChange={dirty} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));fireEvent.click(screen.getByRole('button',{name:'Добавить нажатия'}));
 for(const key of ['Вправо','Вправо','OK'])fireEvent.click(screen.getByRole('button',{name:key}));fireEvent.click(screen.getByRole('button',{name:/Готово/}));
 expect(dirty).toHaveBeenLastCalledWith(true);
 fireEvent.change(screen.getByLabelText('Пауза после нажатия 3, мс'),{target:{value:'1000'}});
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 2/}));fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));
 expect((screen.getByLabelText('Пауза после нажатия 3, мс') as HTMLInputElement).value).toBe('1000');
 fireEvent.click(screen.getByRole('button',{name:'Опустить шаг 1 Когда'}));
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));expect(save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({steps:[steps[1],expect.objectContaining({id:steps[0]!.id,actions:[expect.objectContaining({action:'RIGHT',pauseAfterMs:500}),expect.objectContaining({action:'RIGHT',pauseAfterMs:500}),expect.objectContaining({action:'ENTER',pauseAfterMs:1000})]})]})));
});
test('invalid action pause is reported as pause validation instead of a text error',()=>{
 const actions=[{id:'00000000-0000-4000-8000-000000000020',action:'RIGHT' as const,pauseAfterMs:500}];
 const step={id:'00000000-0000-4000-8000-000000000011',kind:'when' as const,text:'Каталог',actions};
 render(<TestCaseEditor initialCase={{id:crypto.randomUUID(),title:'Пауза',description:'',group:'',steps:[step],status:'draft',version:1,createdAt:1,updatedAt:1}} onSave={vi.fn()} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));fireEvent.change(screen.getByLabelText('Пауза после нажатия 1, мс'),{target:{value:'60001'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 expect(screen.getByRole('alert').textContent).toContain('Пауза');expect(screen.getByRole('alert').textContent).not.toContain('Текст');
 expect(screen.getByLabelText('Описание шага').getAttribute('aria-invalid')).not.toBe('true');
});

test('stages text conditions, retains them across selection and saves them only after applying the step',async()=>{
 const save=vi.fn().mockResolvedValue(true),dirty=vi.fn();
 const steps=[{id:crypto.randomUUID(),kind:'then' as const,text:'Профиль'},{id:crypto.randomUUID(),kind:'when' as const,text:'Далее'}];
 render(<TestCaseEditor initialCase={{id:crypto.randomUUID(),title:'OCR',description:'',group:'',steps,status:'draft',version:1,createdAt:0,updatedAt:0}} onSave={save} onBack={vi.fn()} onDirtyChange={dirty} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));
 for(const [index,text] of ['Мое кино','Мои подписки'].entries()){fireEvent.click(screen.getByRole('button',{name:'Добавить условие'}));fireEvent.change(screen.getByLabelText(`Надпись ${index+1}`),{target:{value:text}});}
 expect(dirty).toHaveBeenLastCalledWith(true);
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 2/}));fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));
 expect((screen.getByLabelText('Надпись 2') as HTMLInputElement).value).toBe('Мои подписки');
 fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));expect(save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Сохранить тест-кейс'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({steps:[expect.objectContaining({textConditions:['Мое кино','Мои подписки']}),steps[1]]})));
});
test('empty condition prevents applying the step with a condition error',()=>{
 render(<TestCaseEditor initialCase={null} onSave={vi.fn()} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Добавить шаг'}));fireEvent.click(screen.getByRole('button',{name:'Добавить шаг Тогда'}));fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:'Профиль'}});
 fireEvent.click(screen.getByRole('button',{name:'Добавить условие'}));fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 expect(screen.getByRole('alert').textContent).toContain('Надпись');expect(screen.getByLabelText('Надпись 1').getAttribute('aria-invalid')).toBe('true');
});
