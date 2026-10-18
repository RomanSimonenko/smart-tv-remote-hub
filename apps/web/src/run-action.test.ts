import {afterEach,expect,test,vi} from 'vitest';
import {api} from './api.js';
const id='00000000-0000-4000-8000-000000000001';
const run={id,testCase:{id,title:'Synthetic',description:'',group:'',status:'draft',version:1,createdAt:1,updatedAt:1,steps:[]},tvId:id,platform:'webos',tvName:'Synthetic',startedAt:1,status:'running',items:[],revision:0};
afterEach(()=>vi.unstubAllGlobals());
test.each(['heartbeat','stop'] as const)('%s sends an explicit empty JSON object',async action=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(run),{status:200,headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetch);
 await api.runAction(id,action,'synthetic-csrf');
 const init=fetch.mock.calls[0]![1];expect(init.headers['content-type']).toBe('application/json');expect(init.body).toBe('{}');
});
test('advance and failure retain their required payloads',async()=>{
 const fetch=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify(run),{status:200})));vi.stubGlobal('fetch',fetch);
 await api.runAction(id,'advance','synthetic-csrf',{itemId:id});await api.runAction(id,'failure','synthetic-csrf',{stage:'camera',code:'SCREEN_NOT_FOUND'});
 expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({itemId:id});expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({stage:'camera',code:'SCREEN_NOT_FOUND'});
});
