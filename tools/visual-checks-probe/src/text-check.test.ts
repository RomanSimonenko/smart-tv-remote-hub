import {test,expect} from 'vitest';
import {compareText,evaluateText} from './text-check.js';
test('exact_text_comparison',()=>{
 expect(compareText('Каталог','Каталог','equals')).toBe(true);
 expect(compareText('каталог','Каталог','equals')).toBe(false);
 expect(compareText('Каталог\n','Каталог','equals')).toBe(false);
 expect(compareText('Главная: Каталог','Каталог','contains')).toBe(true);
 expect(compareText('Каталог','Поиск','notContains')).toBe(true);
});
test('empty_ocr_is_not_absence_evidence',()=>{
 expect(evaluateText({text:'',confidence:0,words:[]},'Каталог','notContains')).toEqual({status:'inconclusive',reason:'Negative OCR conditions require validated frame quality.'});
});
test('positive_ocr_mismatch_is_observation_not_pass',()=>{
 expect(evaluateText({text:'Поиск',confidence:98,words:[]},'Каталог','contains').status).toBe('not-matched');
});
