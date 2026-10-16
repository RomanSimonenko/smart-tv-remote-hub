import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {RemoteLayout} from './RemoteLayout.js';
afterEach(cleanup);
test('uses existing remote order and passes each selection without a network controller',()=>{
 const selected:string[]=[];const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 try {
 render(<RemoteLayout buttonProps={action=>({onClick:()=>selected.push(action)})}/>);
 const numbers=within(screen.getByRole('group',{name:'Цифры'})).getAllByRole('button');
 expect(numbers.map(button=>button.textContent)).toEqual(['1','2','3','4','5','6','7','8','9','0']);
 for(const label of ['Вправо','Вправо','OK','Красная','Запустить Wink'])fireEvent.click(screen.getByRole('button',{name:label}));
 expect(selected).toEqual(['RIGHT','RIGHT','ENTER','RED','wink']);expect(fetch).not.toHaveBeenCalled();
 }finally{vi.unstubAllGlobals();}
});
