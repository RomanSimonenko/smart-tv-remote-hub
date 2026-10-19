import {expect,test} from 'vitest';
import {startTestRunSchema, testRunSchema, testRunSummarySchema} from '../src/test-runs.js';
const id='00000000-0000-4000-8000-000000000001';
test('start validates immutable version and rejects unknown fields',()=>{
 expect(startTestRunSchema.safeParse({id,caseId:id,tvId:id,version:1}).success).toBe(true);
 for(const version of [0,1.5,undefined])expect(startTestRunSchema.safeParse({id,caseId:id,tvId:id,version}).success).toBe(false);
 expect(startTestRunSchema.safeParse({id,caseId:id,tvId:id,version:1,force:true}).success).toBe(false);
});
test('rejects an incomplete run response even when status is passed',()=>{
 expect(testRunSchema.safeParse({id,status:'passed'}).success).toBe(false);
});

test('history titles use the same Unicode limit as saved cases',()=>{
 const title='😀'.repeat(200);
 expect(testRunSchema.shape.testCase.shape.title.safeParse(title).success).toBe(true);
 expect(testRunSummarySchema.shape.caseTitle.safeParse(title).success).toBe(true);
 expect(testRunSummarySchema.shape.caseTitle.safeParse(title+'😀').success).toBe(false);
});
test('accepts explicit OCR verdict statuses and validates persisted conditions',()=>{
 expect(testRunSchema.shape.status.safeParse('passed').success).toBe(true);
 expect(testRunSchema.shape.status.safeParse('failed').success).toBe(true);
 expect(testRunSchema.shape.items.element.safeParse({id,stepId:id,ordinal:1,phase:'saved',verification:{status:'failed',conditions:[{expected:'Мое кино',found:false}],recognizedBlocks:[],engine:'synthetic',model:'1',checkedAt:0,snapshotSha256:'a'.repeat(64)}}).success).toBe(true);
});
