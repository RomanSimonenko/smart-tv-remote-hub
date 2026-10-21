import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TvPairingPin} from './TvPairingPin.js';
afterEach(()=>{cleanup();vi.useRealTimers();});
test('PIN preserves leading zero and prevents a second submission while waiting',async()=>{
 const sent:string[]=[];render(<TvPairingPin operationId="op" expiresAt={Date.now()+30000} busy={false} onSubmit={pin=>{sent.push(pin);}} onCancel={()=>{}}/>);
 const input=screen.getByLabelText('PIN с экрана телевизора');expect(document.activeElement).toBe(input);expect(input.getAttribute('inputmode')).toBe('numeric');
 fireEvent.change(input,{target:{value:'0123'}});await act(async()=>{fireEvent.submit(input.closest('form')!);fireEvent.submit(input.closest('form')!);});expect(sent).toEqual(['0123']);expect((input as HTMLInputElement).value).toBe('');
});
test('expired challenge disables confirm without submitting',()=>{vi.useFakeTimers();vi.setSystemTime(1000);const submit=vi.fn();render(<TvPairingPin operationId="op" expiresAt={2000} busy={false} onSubmit={submit} onCancel={()=>{}}/>);fireEvent.change(screen.getByLabelText('PIN с экрана телевизора'),{target:{value:'1234'}});act(()=>vi.advanceTimersByTime(1001));expect((screen.getByRole('button',{name:'Подтвердить'}) as HTMLButtonElement).disabled).toBe(true);expect(submit).not.toHaveBeenCalled();});
