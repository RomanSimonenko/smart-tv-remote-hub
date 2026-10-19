import {z} from 'zod';
export const MAX_TEXT_CONDITIONS=20;
export const MAX_CONDITION_LENGTH=200;
export const textConditionsSchema=z.array(z.string().trim().refine(value=>[...value].length>=1&&[...value].length<=MAX_CONDITION_LENGTH)).max(MAX_TEXT_CONDITIONS);
export const ocrBlockSchema=z.strictObject({text:z.string().max(10000)});
export type OcrBlock=z.infer<typeof ocrBlockSchema>;
export const textConditionResultSchema=z.strictObject({expected:z.string().max(400),found:z.boolean()});
function normalize(value:string){return value.normalize('NFC').toLowerCase().replace(/\s+/gu,' ').trim();}
/** Match a whole phrase within one OCR block, never across unrelated screen regions. */
export function matchTextConditions(expected:string[],blocks:OcrBlock[]):Array<{expected:string;found:boolean}>{
 const normalized=blocks.map(block=>normalize(block.text));
 const word=/[\p{L}\p{N}\p{M}_]/u;
 return expected.map(expected=>{
  const needle=normalize(expected);
  const found=needle.length>0&&normalized.some(text=>{
   let from=0;
   while(from<=text.length){const index=text.indexOf(needle,from);if(index<0)return false;
    const before=Array.from(text.slice(0,index)).at(-1),after=Array.from(text.slice(index+needle.length))[0];
    if((!before||!word.test(before))&&(!after||!word.test(after)))return true;
    from=index+1;
   }
   return false;
  });return{expected,found};
 });
}
