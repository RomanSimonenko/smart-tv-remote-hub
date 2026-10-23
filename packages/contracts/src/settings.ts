import {z} from 'zod';

const bytes=z.number().int().nonnegative();
export const retentionSelectionSchema=z.object({days:z.number().int().min(1).max(3650),keepUnsuccessful:z.boolean()}).strict();
export const storagePolicySchema=retentionSelectionSchema.extend({automatic:z.boolean()}).strict();
export type StoragePolicy=z.infer<typeof storagePolicySchema>;
export const storageSummarySchema=z.object({
 policy:storagePolicySchema,databaseBytes:bytes,backupBytes:bytes,otherBytes:bytes,totalBytes:bytes,freeBytes:bytes,
 reports:z.object({count:bytes,bytes:bytes}),snapshots:z.object({count:bytes,bytes:bytes,quotaBytes:bytes}),pendingFiles:bytes,
});
export const cleanupCandidateSchema=z.object({id:z.string().uuid(),title:z.string(),endedAt:bytes,revision:bytes,snapshots:bytes,snapshotBytes:bytes,reportBytes:bytes});
export const cleanupPreviewSchema=z.object({token:z.string().uuid(),expiresAt:bytes,candidates:z.array(cleanupCandidateSchema),snapshotBytes:bytes,reportBytes:bytes,truncated:z.boolean()});
export const cleanupConfirmationSchema=z.object({token:z.string().uuid(),confirm:z.literal(true)}).strict();
export const cleanupResultSchema=z.object({deleted:bytes,pendingFiles:bytes});
export const ocrStateSchema=z.object({state:z.enum(['ready','busy','stopped','failed','unknown']),engine:z.string().max(100).nullable(),model:z.string().max(200).nullable()});
export const diagnosticsSchema=z.object({checkedAt:bytes,applicationVersion:z.string(),nodeVersion:z.string(),sqliteVersion:z.string(),schemaVersion:bytes,
 checks:z.object({api:z.literal('ok'),database:z.enum(['ok','error']),storage:z.enum(['ok','error'])}),ocr:ocrStateSchema,
 cleanup:z.object({pendingFiles:bytes.nullable(),lastAutomaticCheckAt:bytes.nullable(),lastAutomaticError:z.boolean().nullable()}),
});
export type StorageSummary=z.infer<typeof storageSummarySchema>;
export type CleanupPreview=z.infer<typeof cleanupPreviewSchema>;
export type Diagnostics=z.infer<typeof diagnosticsSchema>;
export type OcrState=z.infer<typeof ocrStateSchema>;
