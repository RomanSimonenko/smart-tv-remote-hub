// @vitest-environment jsdom
import {afterEach,expect,test} from 'vitest';
import {readNavigation,writeNavigation} from './navigation-state.js';
afterEach(()=>history.replaceState(null,''));
test('restores only the current owner navigation and preserves other history state',()=>{
 history.replaceState({other:'retained'},'');
 writeNavigation('owner',{screen:'profile'});
 expect(readNavigation('owner')).toEqual({screen:'profile'});
 expect(readNavigation('other')).toEqual({screen:'dashboard'});
 expect(history.state.other).toBe('retained');
});
test('restores saved cases and platform-scoped remote and rejects malformed data',()=>{
 const id='00000000-0000-4000-8000-000000000001';
 for(const route of [{screen:'editor',caseId:id},{screen:'remote',tvId:id,platform:'tizen'}] as const){writeNavigation('owner',route);expect(readNavigation('owner')).toEqual(route);}
 history.replaceState({appNavigation:{owner:'owner',route:{screen:'remote',tvId:'bad',platform:'webos'}}},'');
 expect(readNavigation('owner')).toEqual({screen:'dashboard'});
});
test('reload restores run reports without execution data',()=>{
 const id='00000000-0000-4000-8000-000000000001';writeNavigation('owner',{screen:'report',runId:id});expect(readNavigation('owner')).toEqual({screen:'report',runId:id});
});
test('retired camera settings route returns to TV list',()=>{
 history.replaceState({appNavigation:{owner:'owner',route:{screen:'settings'}}},'');
 expect(readNavigation('owner')).toEqual({screen:'dashboard'});
});
