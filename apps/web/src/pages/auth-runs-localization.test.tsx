import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import type {TestRun} from '@remote-webos-tv/contracts';
import {i18n} from '../i18n.js';
import {Login} from './Login.js';
import {RunFailure,RunStatus} from './run-presentation.js';

afterEach(async()=>{cleanup();await i18n.changeLanguage('ru');});
test('switching language preserves login input and translates visible field errors',async()=>{
 render(<Login busy={false} error={null} onSubmit={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Логин'),{target:{value:'Synthetic owner'}});
 fireEvent.submit(screen.getByRole('button',{name:'Войти'}).closest('form')!);
 expect(screen.getByText('Введите пароль.')).toBeTruthy();
 await act(async()=>{await i18n.changeLanguage('en');});
 expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('Synthetic owner');
 expect(screen.getByText('Enter your password.')).toBeTruthy();
 await act(async()=>{await i18n.changeLanguage('ru');});
 expect(screen.getByText('Введите пароль.')).toBeTruthy();
});
test('run status and persisted failure codes translate without altering technical identifiers',async()=>{
 const run={failure:{code:'OCR_TIMEOUT',stage:'ocr'}} as TestRun;
 render(<><RunStatus status="needs_review"/><RunFailure run={run}/></>);
 expect(screen.getByText('Требуется проверка')).toBeTruthy();
 await act(async()=>{await i18n.changeLanguage('en');});
 expect(screen.getByText('Needs review')).toBeTruthy();
 expect(screen.getByRole('alert').textContent).toContain('Text recognition timed out.');
 expect(screen.getByRole('alert').textContent).toContain('Code: OCR_TIMEOUT.');
});
