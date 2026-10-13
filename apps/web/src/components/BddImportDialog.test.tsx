// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {BddImportDialog} from './BddImportDialog.js';
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});
afterEach(cleanup);
test('previews, invalidates and imports only a local draft with fresh ids',()=>{
 const imported=vi.fn();render(<BddImportDialog onClose={vi.fn()} onImport={imported}/>);
 fireEvent.change(screen.getByLabelText('Название'),{target:{value:'Демо'}});
 fireEvent.change(screen.getByLabelText('Исходный текст'),{target:{value:"given('Start'); when('Open'); then('Shown'); when('Next'); then('Done');"}});
 fireEvent.click(screen.getByText('Проверить'));expect(screen.getByLabelText('Предпросмотр импорта')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Исходный текст'),{target:{value:"when('Next')"}});
 expect(screen.queryByLabelText('Предпросмотр импорта')).toBeNull();
 expect((screen.getByText('Открыть в редакторе') as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByText('Проверить'));fireEvent.click(screen.getByText('Открыть в редакторе'));
 expect(imported).toHaveBeenCalledWith(expect.objectContaining({title:'Демо',steps:[expect.objectContaining({kind:'when',text:'Next',id:expect.any(String)})]}));
});
test('rejects arbitrary code, retains input and confirms closing',()=>{
 const close=vi.fn();render(<BddImportDialog onClose={close} onImport={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Исходный текст'),{target:{value:"given('a'); alert('x')"}});
 fireEvent.click(screen.getByText('Проверить'));expect(screen.getByRole('alert')).toBeTruthy();
 fireEvent.click(screen.getByText('Отмена'));expect(close).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Продолжить редактирование'));expect((screen.getByLabelText('Исходный текст') as HTMLTextAreaElement).value).toContain('alert');
 fireEvent.click(screen.getByText('Отмена'));fireEvent.click(screen.getByText('Закрыть без сохранения'));expect(close).toHaveBeenCalledOnce();
});

test('extracts scenario title, preserves user edits and shows ignored callback notice',()=>{
 render(<BddImportDialog onClose={vi.fn()} onImport={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Исходный текст'),{target:{value:"scenario.manual.skip('Demo',async()=>{given('a');then('b',async()=>{});});"}});
 fireEvent.click(screen.getByText('Проверить'));
 expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Demo');
 expect(screen.getByRole('status').textContent).toContain('Функции при шагах пропущены: 1');
 fireEvent.change(screen.getByLabelText('Название'),{target:{value:'Custom'}});
 fireEvent.change(screen.getByLabelText('Исходный текст'),{target:{value:"scenario('Other',()=>{when('a');});"}});
 fireEvent.click(screen.getByText('Проверить'));
 expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Custom');
 expect(screen.queryByRole('status')).toBeNull();
});
