import {expect,test} from 'vitest';
import {parseBdd} from './bdd-import.js';
test('preserves repeated types and chains, comments and escapes',()=>{
 expect(parseBdd(`// synthetic\nawait given('Start').and("A\\nB"); when('Open'); then('Shown'); when('Next'); then('Done');`).map(s=>[s.kind,s.text])).toEqual([['given','Start'],['given','A\nB'],['when','Open'],['then','Shown'],['when','Next'],['then','Done']]);
});
test.each(['',"given(value)","given(`value`)","given('a'); alert('x')","test('x',()=>given('a'))","given('a').other('b')","given('a', 'b')","and('a')","given('')","import x from 'x'", "(given)('a')"] )('rejects unsupported input without partial import: %s',source=>expect(()=>parseBdd(source)).toThrow());
test('limits bytes, steps and text and reports safe positions',()=>{
 expect(()=>parseBdd(' '.repeat(65537))).toThrow('64');
 expect(()=>parseBdd("given('a');".repeat(201))).toThrow('200');
 expect(()=>parseBdd(`given('${'a'.repeat(2001)}')`)).toThrow('2000');
 expect(()=>parseBdd("given('a');\nthrow 'private';")).toThrow('строка 2');
 expect(()=>parseBdd("given('a');\nthrow 'private';")).not.toThrow('private');
});

test('accepts exact limits and rejects overly deep chains',()=>{
 expect(parseBdd("given('a');".repeat(200))).toHaveLength(200);
 expect(parseBdd(`given('${'a'.repeat(2000)}')`)[0]!.text).toHaveLength(2000);
 expect(()=>parseBdd("given('a')"+".and('a')".repeat(220))).toThrow('200');
});

test('imports one manual skipped scenario, its title and eleven ordered steps without running callbacks',async()=>{
 const {parseBddScenario}=await import('./bdd-import.js');
 const result=parseBddScenario(`scenario.manual.skip('Synthetic schedule', async () => {
 await given('Initial state').and('Different labels');
 await when('Open schedule').and('Focus channel');
 await then('Current item shown').and('Current item selected',async()=>{ throw new Error('must not execute'); });
 await when('Load history');
 await then('History shown').and('Selection retained').and('Stable list').and('App remains open');
 });`);
 expect(result.title).toBe('Synthetic schedule');
 expect(result.steps.map(step=>step.kind)).toEqual(['given','given','when','when','then','then','when','then','then','then','then']);
 expect(result.ignoredCallbacks).toBe(1);
 expect(result.steps[5]!.text).toBe('Current item selected');
});

test.each(['scenario','scenario.manual','scenario.skip','scenario.manual.skip'])('accepts %s without importing callback contents',async wrapper=>{
 const {parseBddScenario}=await import('./bdd-import.js');
 const result=parseBddScenario(`${wrapper}('Demo',async()=>{given('a',()=>{then('nested');});then('b',function(){throw new Error('unused');});});`);
 expect(result.steps.map(step=>step.text)).toEqual(['a','b']);expect(result.ignoredCallbacks).toBe(2);
});
test.each([
 "scenario.manual.skip('Demo', handler)",
 "scenario.manual.skip(name,async()=>{given('a');})",
 "scenario.manual.skip('Demo',async()=>{given('a');alert('x');})",
 "scenario.manual.skip('Demo',async()=>{given('a');});given('b');",
 "scenario('A',()=>{given('a');});scenario('B',()=>{given('b');});",
 "scenario.manual.skip('',()=>{given('a');})",
 "scenario.manual.skip('Demo',()=>given('a'))",
 "given('a',handler)","given('a',()=>{},'extra')","given('a',function*(){})"
])('rejects unsupported wrappers and arguments: %s',source=>expect(()=>parseBdd(source)).toThrow());
