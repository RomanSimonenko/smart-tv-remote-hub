// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {useTestCases} from './useTestCases.js';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
test('loads cases and preserves creation identity after a network failure',async()=>{
 const bodies:string[]=[];let attempts=0;
 vi.stubGlobal('fetch',async(_url:string,init:RequestInit)=>{
 if(init?.method==='POST'){bodies.push(init.body as string);if(++attempts===1)throw new Error('network'); const input=JSON.parse(init.body as string);return new Response(JSON.stringify({...input,version:1,status:'draft',createdAt:1,updatedAt:1}));}
 return new Response(JSON.stringify({cases:[]}));
 });
 const {result}=renderHook(()=>useTestCases('csrf',()=>{}));
 await waitFor(()=>expect(result.current.loading).toBe(false));
 act(()=>result.current.create());
 const draft={title:'QA',description:'',group:'',steps:[]};
 await act(async()=>{expect(await result.current.save(draft)).toBe(false);});
 await act(async()=>{expect(await result.current.save(draft)).toBe(true);});
 expect(JSON.parse(bodies[0]!).id).toBe(JSON.parse(bodies[1]!).id);
 expect(result.current.current?.version).toBe(1);
});
test('rejects a second simultaneous save and retains current version on conflict',async()=>{
 let finish:(response:Response)=>void=()=>{};let writes=0;
 vi.stubGlobal('fetch',async(_url:string,init:RequestInit)=>{if(init?.method==='POST'){writes++;return new Promise<Response>(resolve=>{finish=resolve;});}return new Response(JSON.stringify({cases:[]}));});
 const {result}=renderHook(()=>useTestCases('csrf',()=>{}));await waitFor(()=>expect(result.current.loading).toBe(false));act(()=>result.current.create());
 const draft={title:'QA',description:'',group:'',steps:[]};let pending:Promise<boolean>;
 act(()=>{pending=result.current.save(draft);});
 await act(async()=>{expect(await result.current.save(draft)).toBe(false);});expect(writes).toBe(1);
 await act(async()=>{finish(new Response(JSON.stringify({code:'VERSION_CONFLICT',message:'Version conflict',requestId:'synthetic'}),{status:409}));expect(await pending!).toBe(false);});
 expect(result.current.current).toBeNull();expect(result.current.error).toContain('другой вкладке');
});
test('ignores a stale read and reports session expiry',async()=>{
 const item={id:'00000000-0000-4000-8000-000000000001',title:'Old',description:'',group:'',steps:[],version:1,status:'draft',createdAt:1,updatedAt:1};
 let finish:(response:Response)=>void=()=>{};const expired=vi.fn();
 vi.stubGlobal('fetch',async(url:string)=> url.endsWith('/test-cases')?new Response(JSON.stringify({cases:[]})):new Promise<Response>(resolve=>{finish=resolve;}));
 const {result}=renderHook(()=>useTestCases('csrf',expired));await waitFor(()=>expect(result.current.loading).toBe(false));
 let pending:Promise<boolean>;act(()=>{pending=result.current.open(item.id);});act(()=>result.current.create());
 await act(async()=>{finish(new Response(JSON.stringify(item)));expect(await pending!).toBe(false);});expect(result.current.current).toBeNull();
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({code:'UNAUTHORIZED',message:'Unauthorized',requestId:'synthetic'}),{status:401}));
 await act(async()=>{await result.current.save({title:'QA',description:'',group:'',steps:[]});});expect(expired).toHaveBeenCalledTimes(1);
});
