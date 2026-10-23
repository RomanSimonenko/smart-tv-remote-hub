import {afterEach,expect,test,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {LanguageSelect} from './components/LanguageSelect.js';
import {createElement} from 'react';
import {i18n,setLanguage,readLanguage,formatLocale,resources} from './i18n.js';
afterEach(async()=>{cleanup();vi.restoreAllMocks();await setLanguage('ru');localStorage.clear();});
test('explicit language switch updates translations and the document without changing user text',async()=>{
 await setLanguage('en');
 expect(i18n.t('language',{ns:'common'})).toBe('Interface language');
 expect(document.documentElement.lang).toBe('en');
 expect(formatLocale()).toBe('en-US');
 expect(localStorage.getItem('smart-tv-remote-hub.locale.v1')).toBe('en');
 await setLanguage('ru');expect(i18n.t('language',{ns:'common'})).toBe('Язык интерфейса');
});
test('both languages supply exactly the same keys in every namespace',()=>{
 for(const ns of Object.keys(resources.ru) as (keyof typeof resources.ru)[]){
  expect(Object.keys(resources.en[ns]).sort()).toEqual(Object.keys(resources.ru[ns]).sort());
 }
});
test('only a supported explicitly saved language overrides Russian',()=>{
 expect(readLanguage()).toBe('ru');
 localStorage.setItem('smart-tv-remote-hub.locale.v1','en');expect(readLanguage()).toBe('en');
 for(const value of ['de','', '{"language":"en"}']){
  localStorage.setItem('smart-tv-remote-hub.locale.v1',value);expect(readLanguage()).toBe('ru');
 }
});
test('storage failure still changes language and reports that it is temporary',async()=>{
 render(createElement(LanguageSelect));
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Unavailable','SecurityError');});
 await act(async()=>{fireEvent.change(screen.getByLabelText('Язык интерфейса'),{target:{value:'en'}});});
 expect(document.documentElement.lang).toBe('en');
 expect(screen.getByRole('alert').textContent).toBe('Could not save the language. Your choice applies until the page is closed.');
 vi.restoreAllMocks();
 await act(async()=>{await setLanguage('ru');});
 expect(screen.queryByRole('alert')).toBeNull();
});
