import {expect,test} from 'vitest';
import {startTestRunSchema, testRunSchema, testRunSummarySchema} from '../src/test-runs.js';
const id='00000000-0000-4000-8000-000000000001';
test('start validates immutable version and rejects unknown fields',()=>{
 expect(startTestRunSchema.safeParse({id,caseId:id,tvId:id,version:1}).success).toBe(true);
 for(const version of [0,1.5,undefined])expect(startTestRunSchema.safeParse({id,caseId:id,tvId:id,version}).success).toBe(false);
 expect(startTestRunSchema.safeParse({id,caseId:id,tvId:id,version:1,force:true}).success).toBe(false);
});
test('run response cannot claim a passing visual verdict',()=>{
 expect(testRunSchema.safeParse({id,status:'passed'}).success).toBe(false);
});

test('history titles use the same Unicode limit as saved cases',()=>{
 const title='😀'.repeat(200);
 expect(testRunSchema.shape.testCase.shape.title.safeParse(title).success).toBe(true);
 expect(testRunSummarySchema.shape.caseTitle.safeParse(title).success).toBe(true);
 expect(testRunSummarySchema.shape.caseTitle.safeParse(title+'😀').success).toBe(false);
});
