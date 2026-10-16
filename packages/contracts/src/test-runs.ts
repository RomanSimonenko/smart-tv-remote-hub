import {z} from 'zod';
import {tvIdentitySchema} from './tv.js';
import {testCaseSchema,testCaseKeyActionSchema} from './test-cases.js';
import {tvCommandResultSchema} from './tv-command.js';
export const MAX_SNAPSHOT_BYTES=5*1024*1024;
export const RUN_LEASE_MS=20_000;
export const startTestRunSchema=z.strictObject({id:z.uuid(),caseId:z.uuid(),version:z.number().int().positive(),tvId:z.uuid()});
export type StartTestRun=z.infer<typeof startTestRunSchema>;
export const runFailureSchema=z.strictObject({stage:z.enum(['command','camera','storage','connection','lifecycle']),code:z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/)});
export const testRunItemSchema=z.strictObject({
 id:z.uuid(),stepId:z.uuid(),ordinal:z.number().int().positive(),action:testCaseKeyActionSchema.optional(),
 phase:z.enum(['pending','sending','awaiting_snapshot','saved']),
 delivery:tvCommandResultSchema.optional(),captureNotBefore:z.number().nonnegative().optional(),
 capturedAt:z.number().int().nonnegative().optional(),savedAt:z.number().int().nonnegative().optional(),
 cameraLabel:z.string().max(200).optional(),bytes:z.number().int().positive().optional(),sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export const testRunSchema=z.strictObject({
 id:z.uuid(),testCase:testCaseSchema,tvId:z.uuid(),platform:z.enum(['webos','tizen']),tvName:z.string().max(200),tvPlatformVersion:tvIdentitySchema.shape.platformVersion,
 startedAt:z.number().int().nonnegative(),endedAt:z.number().int().nonnegative().optional(),
 status:z.enum(['running','needs_review','stopped','error']),settling:z.boolean().optional(),failure:runFailureSchema.optional(),
 items:z.array(testRunItemSchema).max(40_000),revision:z.number().int().nonnegative(),
});
export const testRunSummarySchema=testRunSchema.omit({items:true,testCase:true}).extend({caseId:z.uuid(),caseTitle:testCaseSchema.shape.title,caseVersion:z.number().int().positive(),savedCount:z.number().int().nonnegative(),itemCount:z.number().int().nonnegative()});
export const testRunsResponseSchema=z.strictObject({runs:z.array(testRunSummarySchema).max(100),next:z.string().nullable()});
export type TestRunSummary=z.infer<typeof testRunSummarySchema>;
export type TestRun=z.infer<typeof testRunSchema>;
export type TestRunItem=z.infer<typeof testRunItemSchema>;
export type RunFailure=z.infer<typeof runFailureSchema>;
