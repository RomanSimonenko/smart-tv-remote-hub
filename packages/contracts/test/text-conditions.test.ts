import {expect,test} from 'vitest';
import {testCaseStepSchema} from '../src/test-cases.js';
import {matchTextConditions} from '../src/text-conditions.js';
const step={id:'00000000-0000-4000-8000-000000000001',kind:'then',text:'Профиль'};
test('preserves conditions and validates Unicode limits without changing legacy steps',()=>{
 expect(testCaseStepSchema.parse(step)).toEqual(step);
 expect(testCaseStepSchema.parse({...step,textConditions:[' Мое кино ','😀'.repeat(200)]}).textConditions).toEqual(['Мое кино','😀'.repeat(200)]);
 for(const textConditions of [[' '],['😀'.repeat(201)],Array(21).fill('Текст')])expect(testCaseStepSchema.safeParse({...step,textConditions}).success).toBe(false);
 expect(testCaseStepSchema.safeParse({...step,textConditions:Array(20).fill('Текст')}).success).toBe(true);
});
test('matches all phrases on the same observation with explicit normalization',()=>{
 expect(matchTextConditions(['Мое кино','Мои подписки','Café'],[{text:' МОЕ  кино '},{text:'Мои\nподписки'},{text:'Café'}])).toEqual([{expected:'Мое кино',found:true},{expected:'Мои подписки',found:true},{expected:'Café',found:true}]);
});
test('does not invent matches from parts of words, unrelated blocks or OCR corrections',()=>{
 expect(matchTextConditions(['кино','Мое кино','Моё кино','подписки'],[{text:'кинотеатр'},{text:'Мое'},{text:'кино'},{text:'Мои подпискн'}])).toEqual([{expected:'кино',found:true},{expected:'Мое кино',found:false},{expected:'Моё кино',found:false},{expected:'подписки',found:false}]);
 expect(matchTextConditions(['кино'],[{text:'кинотеатр'}])[0]?.found).toBe(false);
 expect(matchTextConditions(['Мое кино'],[])[0]?.found).toBe(false);
 expect(matchTextConditions(['кино!'],[{text:'кино'}])[0]?.found).toBe(false);
});
