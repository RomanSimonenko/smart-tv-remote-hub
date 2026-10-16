import { z } from 'zod';
import { tvActionCatalog, type TvActionId } from './tv-actions.js';
export const MAX_STEP_KEY_ACTIONS = 200;
export const DEFAULT_KEY_PAUSE_MS = 500;
export const MAX_KEY_PAUSE_MS = 60000;
export const testCaseKeyActionSchema = z.strictObject({
 id: z.uuid(),
 action: z.custom<TvActionId>((value) => typeof value === 'string' && tvActionCatalog.some(action => action.id === value), 'Unknown TV action'),
 pauseAfterMs: z.number().int().min(0).max(MAX_KEY_PAUSE_MS),
});
export const testCaseKeyActionsSchema = z.array(testCaseKeyActionSchema).max(MAX_STEP_KEY_ACTIONS).refine(actions => new Set(actions.map(action => action.id)).size === actions.length, 'Duplicate action identity');
export type TestCaseKeyAction = z.infer<typeof testCaseKeyActionSchema>;
export const testCaseIdSchema = z.uuid();
const boundedText = (min: number, max: number) => z.string().trim().refine(value => [...value].length >= min && [...value].length <= max);
export const testCaseStepSchema = z.strictObject({ id: z.uuid(), kind: z.enum(['given', 'when', 'then']), text: boundedText(1, 2000), actions: testCaseKeyActionsSchema.optional() });
const fields = { title: boundedText(1, 200), description: z.string().max(10000), group: boundedText(0, 100), steps: z.array(testCaseStepSchema).max(200).refine(steps => new Set(steps.map(step => step.id)).size === steps.length) };
const readiness = {status:z.enum(['draft','ready']).optional()};
const readyHasSteps = (value:{status?:string|undefined;steps:unknown[]}) => value.status !== 'ready' || value.steps.length > 0;
const readinessIssue = {message:'Добавьте хотя бы один шаг для готового кейса',path:['status']};
export const testCaseDraftSchema = z.strictObject({...fields,...readiness}).refine(readyHasSteps,readinessIssue);
export const createTestCaseSchema = z.strictObject({ ...fields,...readiness, id: z.uuid() }).refine(readyHasSteps,readinessIssue);
export const updateTestCaseSchema = z.strictObject({ ...fields,...readiness, version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1) }).refine(readyHasSteps,readinessIssue);
export const testCaseSchema = z.strictObject({ ...fields, id: z.uuid(), version: z.number().int().positive(), createdAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(), status: z.enum(['draft','ready']) }).refine(readyHasSteps,readinessIssue);
export const testCasesResponseSchema = z.strictObject({ cases: z.array(testCaseSchema) });
export type TestCaseStep = z.infer<typeof testCaseStepSchema>;
export type TestCaseDraft = z.infer<typeof testCaseDraftSchema>;
export type CreateTestCase = z.infer<typeof createTestCaseSchema>;
export type UpdateTestCase = z.infer<typeof updateTestCaseSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
