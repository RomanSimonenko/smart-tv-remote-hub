import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {StepKeySequence} from './StepKeySequence.js';
import {MIN_KEY_HOLD_MS,MAX_KEY_HOLD_MS} from '@remote-webos-tv/contracts';
afterEach(cleanup);
const actions=[{id:'00000000-0000-4000-8000-000000000011',action:'RIGHT' as const,pauseAfterMs:500},{id:'00000000-0000-4000-8000-000000000012',action:'ENTER' as const,pauseAfterMs:1000}];
test('enables hold only for eligible buttons and preserves pause when editing or disabling hold',()=>{
 const change=vi.fn();const view=render(<StepKeySequence actions={actions} onChange={change} disabled={false}/>);
 fireEvent.click(screen.getByLabelText('Удерживать кнопку 1'));
 expect(change).toHaveBeenLastCalledWith([{...actions[0],holdForMs:1000},actions[1]]);
 expect(screen.queryByLabelText('Удерживать кнопку 2')).toBeNull();
 view.rerender(<StepKeySequence actions={[{...actions[0]!,holdForMs:1000},actions[1]!]} onChange={change} disabled={false}/>);
 fireEvent.change(screen.getByLabelText('Длительность удержания 1, мс'),{target:{value:'2000'}});
 expect(change.mock.lastCall?.[0][0]).toEqual({...actions[0],holdForMs:2000});
 fireEvent.click(screen.getByLabelText('Удерживать кнопку 1'));
 expect(change).toHaveBeenLastCalledWith(actions);
});
test('reorders and removes actions by identity and edits pause without coercing invalid values',()=>{
 const change=vi.fn();render(<StepKeySequence actions={actions} onChange={change} disabled={false}/>);
 fireEvent.keyDown(screen.getByRole('button',{name:'Перетащить нажатие 2'}),{key:'ArrowUp',altKey:true});expect(change).toHaveBeenLastCalledWith([actions[1],actions[0]]);
 fireEvent.click(screen.getByRole('button',{name:'Удалить нажатие 1'}));expect(change).toHaveBeenLastCalledWith([actions[1]]);
 fireEvent.change(screen.getByLabelText('Пауза после нажатия 1, мс'),{target:{value:'60001'}});
 expect(change.mock.lastCall?.[0][0].pauseAfterMs).toBe(60001);
 fireEvent.change(screen.getByLabelText('Пауза после нажатия 1, мс'),{target:{value:''}});
 expect(Number.isNaN(change.mock.lastCall?.[0][0].pauseAfterMs)).toBe(true);
});

test('native spinner changes pause by 100 ms while exact manual values stay supported',()=>{
 const change=vi.fn();render(<StepKeySequence actions={actions} onChange={change} disabled={false}/>);
 const input=screen.getByLabelText('Пауза после нажатия 1, мс') as HTMLInputElement;
 input.stepUp();expect(input.value).toBe('600');input.stepDown(2);expect(input.value).toBe('400');
 fireEvent.change(input,{target:{value:'501'}});expect(change.mock.lastCall?.[0][0].pauseAfterMs).toBe(501);
});

test('styled pause controls use native 100ms stepping without submitting the editor',()=>{
 const change=vi.fn();render(<StepKeySequence actions={actions} onChange={change} disabled={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'Увеличить паузу после нажатия 1 на 100 мс'}));expect(change.mock.lastCall?.[0][0].pauseAfterMs).toBe(600);
 fireEvent.click(screen.getByRole('button',{name:'Уменьшить паузу после нажатия 1 на 100 мс'}));expect(change.mock.lastCall?.[0][0].pauseAfterMs).toBe(500);
});

test('hold uses the same styled 100ms controls and respects bounds and disabled state',()=>{
 const change=vi.fn();const view=render(<StepKeySequence actions={[{...actions[0]!,holdForMs:1000},actions[1]!]} onChange={change} disabled={false}/>);
 expect(screen.queryByText('—')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Увеличить удержание нажатия 1 на 100 мс'}));expect(change.mock.lastCall?.[0][0].holdForMs).toBe(1100);
 fireEvent.click(screen.getByRole('button',{name:'Уменьшить удержание нажатия 1 на 100 мс'}));expect(change.mock.lastCall?.[0][0].holdForMs).toBe(1000);
 view.rerender(<StepKeySequence actions={[{...actions[0]!,holdForMs:MIN_KEY_HOLD_MS}]} onChange={change} disabled={false}/>);
 expect((screen.getByRole('button',{name:'Уменьшить удержание нажатия 1 на 100 мс'}) as HTMLButtonElement).disabled).toBe(true);
 view.rerender(<StepKeySequence actions={[{...actions[0]!,holdForMs:MAX_KEY_HOLD_MS}]} onChange={change} disabled={false}/>);
 expect((screen.getByRole('button',{name:'Увеличить удержание нажатия 1 на 100 мс'}) as HTMLButtonElement).disabled).toBe(true);
 view.rerender(<StepKeySequence actions={[{...actions[0]!,holdForMs:1000}]} onChange={change} disabled/>);
 expect((screen.getByRole('button',{name:'Увеличить удержание нажатия 1 на 100 мс'}) as HTMLButtonElement).disabled).toBe(true);
});

test('drag reorders identities and cancellation does not change actions',()=>{
 const change=vi.fn();render(<StepKeySequence actions={actions} onChange={change} disabled={false}/>);
 const handle=screen.getByRole('button',{name:'Перетащить нажатие 2'});const transfer={setData:vi.fn(),effectAllowed:''};
 fireEvent.dragStart(handle,{dataTransfer:transfer});fireEvent.drop(screen.getByRole('button',{name:'Перетащить нажатие 1'}).closest('li')!);expect(change).toHaveBeenLastCalledWith([actions[1],actions[0]]);
 change.mockClear();fireEvent.dragStart(handle,{dataTransfer:transfer});fireEvent.dragEnd(handle);expect(change).not.toHaveBeenCalled();
});
