import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {StepKeySequence} from './StepKeySequence.js';
afterEach(cleanup);
const actions=[{id:'00000000-0000-4000-8000-000000000011',action:'RIGHT' as const,pauseAfterMs:500},{id:'00000000-0000-4000-8000-000000000012',action:'ENTER' as const,pauseAfterMs:1000}];
test('reorders and removes actions by identity and edits pause without coercing invalid values',()=>{
 const change=vi.fn();render(<StepKeySequence actions={actions} onChange={change} disabled={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'Поднять нажатие 2'}));expect(change).toHaveBeenLastCalledWith([actions[1],actions[0]]);
 fireEvent.click(screen.getByRole('button',{name:'Удалить нажатие 1'}));expect(change).toHaveBeenLastCalledWith([actions[1]]);
 fireEvent.change(screen.getByLabelText('Пауза после нажатия 1, мс'),{target:{value:'60001'}});
 expect(change.mock.lastCall?.[0][0].pauseAfterMs).toBe(60001);
 fireEvent.change(screen.getByLabelText('Пауза после нажатия 1, мс'),{target:{value:''}});
 expect(Number.isNaN(change.mock.lastCall?.[0][0].pauseAfterMs)).toBe(true);
});
