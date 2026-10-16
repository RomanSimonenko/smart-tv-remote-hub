import { expect, test } from 'vitest';
import { testCaseDraftSchema, createTestCaseSchema, updateTestCaseSchema } from '../src/test-cases.js';
const id = '00000000-0000-4000-8000-000000000001';
const draft = { title: ' Кейс ', description: '', group: '', steps: [] };
test('normalizes title and permits an empty draft', () => {
  expect(testCaseDraftSchema.parse(draft)).toEqual({ ...draft, title: 'Кейс' });
});
test.each([['title', '', false], ['title', ' '.repeat(20), false], ['title', 'a'.repeat(200), true], ['title', 'a'.repeat(201), false], ['description', 'a'.repeat(10000), true], ['description', 'a'.repeat(10001), false], ['group', 'a'.repeat(100), true], ['group', 'a'.repeat(101), false]])('validates %s boundary', (key, value, valid) => {
 expect(testCaseDraftSchema.safeParse({ ...draft, [key as string]: value }).success).toBe(valid);
});
test('validates step text, identity, block, uniqueness and count', () => {
 const step = { id, kind: 'given', text: ' Шаг ' };
 expect(testCaseDraftSchema.parse({ ...draft, steps: [step] }).steps[0]?.text).toBe('Шаг');
 for (const invalid of [{ ...step, id: 'bad' }, { ...step, kind: 'bad' }, { ...step, text: '' }, { ...step, text: 'a'.repeat(2001) }]) expect(testCaseDraftSchema.safeParse({ ...draft, steps: [invalid] }).success).toBe(false);
 expect(testCaseDraftSchema.safeParse({ ...draft, steps: [{ ...step, text: 'a'.repeat(2000) }] }).success).toBe(true);
 expect(testCaseDraftSchema.safeParse({ ...draft, steps: [step, step] }).success).toBe(false);
 const steps = Array.from({length:201},(_,i)=>({...step,id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`}));
 expect(testCaseDraftSchema.safeParse({ ...draft, steps: steps.slice(0,200) }).success).toBe(true);
 expect(testCaseDraftSchema.safeParse({ ...draft, steps }).success).toBe(false);
});
test('requires client UUID and positive safe integer version', () => {
 expect(createTestCaseSchema.safeParse({...draft,id}).success).toBe(true);
 expect(createTestCaseSchema.safeParse({...draft,id:'bad'}).success).toBe(false);
 for(const version of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1]) expect(updateTestCaseSchema.safeParse({...draft,version}).success).toBe(false);
 expect(updateTestCaseSchema.safeParse({...draft,version:1}).success).toBe(true);
});

test('ready cases require steps and preserve explicit readiness', () => {
 expect(testCaseDraftSchema.safeParse({...draft,status:'ready'}).success).toBe(false);
 expect(testCaseDraftSchema.parse({...draft,status:'ready',steps:[{id,kind:'then',text:'Состояние'}]}).status).toBe('ready');
 expect(testCaseDraftSchema.safeParse({...draft,status:'passed'}).success).toBe(false);
});

test('preserves key actions and legacy steps while validating pauses, keys, count and identity',()=>{
 const step={id,kind:'when',text:'Открыть каталог'};
 const actions=['RIGHT','RIGHT','ENTER','power','wink'].map((action,i)=>({id:`00000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`,action,pauseAfterMs:[0,500,60000,500,500][i]}));
 expect(testCaseDraftSchema.parse({...draft,steps:[{...step,actions}]}).steps[0]).toEqual({...step,actions});
 expect(testCaseDraftSchema.parse({...draft,steps:[step]}).steps[0]).toEqual(step);
 for(const pauseAfterMs of [-1,60001,1.5,'500',null]) expect(testCaseDraftSchema.safeParse({...draft,steps:[{...step,actions:[{...actions[0],pauseAfterMs}]}]}).success).toBe(false);
 for(const action of ['unknown','right','',null]) expect(testCaseDraftSchema.safeParse({...draft,steps:[{...step,actions:[{...actions[0],action}]}]}).success).toBe(false);
 expect(testCaseDraftSchema.safeParse({...draft,steps:[{...step,actions:[actions[0],actions[0]]}]}).success).toBe(false);
 const many=Array.from({length:201},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+100).padStart(12,'0')}`,action:'RIGHT',pauseAfterMs:500}));
 expect(testCaseDraftSchema.safeParse({...draft,steps:[{...step,actions:many.slice(0,200)}]}).success).toBe(true);
 expect(testCaseDraftSchema.safeParse({...draft,steps:[{...step,actions:many}]}).success).toBe(false);
});
