import type {OcrObservation} from './ocr.js';
export type TextOperator='equals'|'contains'|'notContains';
export type Verdict={status:'matched'|'not-matched'|'inconclusive';reason:string};
export function compareText(actual:string,expected:string,operator:TextOperator):boolean{
 if(!expected)throw new Error('Expected text must not be empty');
 switch(operator){case 'equals':return actual===expected;case 'contains':return actual.includes(expected);case 'notContains':return !actual.includes(expected);}
}
export function evaluateText(observation:OcrObservation,expected:string,operator:TextOperator):Verdict{
 if(operator==='notContains')return{status:'inconclusive',reason:'Negative OCR conditions require validated frame quality.'};
 return compareText(observation.text,expected,operator)?{status:'matched',reason:'Expected text was recognized.'}:{status:'not-matched',reason:'Expected text was not recognized; frame quality is not established by OCR.'};
}
