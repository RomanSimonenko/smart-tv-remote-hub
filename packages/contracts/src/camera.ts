import {z} from 'zod';
const point=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).strict();
export const screenCornersSchema=z.tuple([point,point,point,point]);
export const cameraPriorSchema=z.object({corners:screenCornersSchema,polarity:z.tuple([z.number().int().min(-1).max(1),z.number().int().min(-1).max(1),z.number().int().min(-1).max(1),z.number().int().min(-1).max(1)])}).strict();
export const cameraPreviewSchema=z.discriminatedUnion('status',[
 z.object({status:z.literal('found'),image:z.string().min(1).max(4*1024*1024),prior:cameraPriorSchema}),
 z.object({status:z.literal('not-found')})
]);
export type CameraPrior=z.infer<typeof cameraPriorSchema>;
export type CameraPreview=z.infer<typeof cameraPreviewSchema>;
