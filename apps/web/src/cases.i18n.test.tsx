// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {i18n} from './i18n.js';
import {TestCaseEditor} from './pages/TestCaseEditor.js';
import {BddImportDialog} from './components/BddImportDialog.js';
import {useTestCases} from './useTestCases.js';

afterEach(async()=>{cleanup();vi.unstubAllGlobals();await i18n.changeLanguage('ru');});

test('uses Russian and English step plurals including zero and compound counts',async()=>{
 const translate=(count:number)=>i18n.t('stepCount',{ns:'cases',count});
 expect([0,1,2,5,21].map(translate)).toEqual(['0 шагов','1 шаг','2 шага','5 шагов','21 шаг']);
 await i18n.changeLanguage('en');
 expect([0,1,2,21].map(translate)).toEqual(['0 steps','1 step','2 steps','21 steps']);
});

test('switches editor validation and notices while preserving draft and condition text',async()=>{
 const save=vi.fn();
 const step={id:crypto.randomUUID(),kind:'then' as const,text:'Русский шаг',textConditions:['Русская надпись']};
 render(<TestCaseEditor initialDraft={{title:'Русский кейс',description:'Описание',group:'Группа',steps:[step]}} initialCase={null} onSave={save} onBack={vi.fn()} onDirtyChange={vi.fn()} saving={false} error="" onReloadConflict={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:/Выбрать шаг 1/}));
 fireEvent.change(screen.getByLabelText('Описание шага'),{target:{value:''}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаг'}));
 expect(screen.getByLabelText('Описание шага').getAttribute('aria-invalid')).toBe('true');
 await act(()=>i18n.changeLanguage('en'));
 expect(screen.getByRole('alert').textContent).toBe('Step description: 1 to 2000 characters.');
 expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Русский кейс');
 expect((screen.getByLabelText('Text 1') as HTMLInputElement).value).toBe('Русская надпись');
 expect(screen.getByLabelText('Step description').getAttribute('aria-invalid')).toBe('true');
 fireEvent.change(screen.getByLabelText('Step description'),{target:{value:'Изменённый шаг'}});
 fireEvent.click(screen.getByRole('button',{name:'Save step'}));
 expect(screen.getByText('Step saved to draft')).toBeTruthy();
 await act(()=>i18n.changeLanguage('ru'));
 expect(screen.getByText('Шаг сохранён в черновик')).toBeTruthy();
 expect((screen.getByLabelText('Описание шага') as HTMLTextAreaElement).value).toBe('Изменённый шаг');
 expect(save).not.toHaveBeenCalled();
});

test('retranslates an existing parser error without replacing imported source or title',async()=>{
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 HTMLDialogElement.prototype.close=function(){this.open=false;};
 render(<BddImportDialog onClose={vi.fn()} onImport={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Название'),{target:{value:'Исходный кейс'}});
 fireEvent.change(screen.getByLabelText('Исходный текст'),{target:{value:"given('Надпись'"}});
 fireEvent.click(screen.getByRole('button',{name:'Проверить'}));
 expect(screen.getByRole('alert').textContent).toContain('Ошибка синтаксиса');
 await act(()=>i18n.changeLanguage('en'));
 expect(screen.getByRole('alert').textContent).toContain('Syntax error (line 1, column');
 expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Исходный кейс');
 expect((screen.getByLabelText('Source text') as HTMLTextAreaElement).value).toBe("given('Надпись'");
});

test('retranslates request errors without starting another request',async()=>{
 const request=vi.fn().mockRejectedValue(new Error('offline'));vi.stubGlobal('fetch',request);
 const {result}=renderHook(()=>useTestCases('csrf',()=>{}));
 await waitFor(()=>expect(result.current.error).toContain('Не удалось выполнить запрос'));
 await act(()=>i18n.changeLanguage('en'));
 expect(result.current.error).toBe('The request failed. Check your connection and try again.');
 expect(request).toHaveBeenCalledTimes(1);
});
