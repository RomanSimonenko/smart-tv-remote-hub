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
