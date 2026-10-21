import {WebmFile} from '@fix-webm-duration/parser';
import {fixParsedWebmDuration} from '@fix-webm-duration/fix';

export async function finalizeCameraRecording(blob:Blob,durationMs:number):Promise<Blob>{
 if(!blob.type.startsWith('video/webm'))return blob;
 const file=await WebmFile.fromBlob(blob);
 fixParsedWebmDuration(file,Math.max(1,durationMs),{logger:false});
 // Validate the postcondition: the convenience API silently returns the raw blob on failure.
 const duration=file.getSectionById(0x8538067)?.getSectionById(0x549a966)?.getSectionById(0x489)?.getValue();
 if(typeof duration!=='number'||!Number.isFinite(duration)||duration<=0)throw new Error('WEBM_DURATION_MISSING');
 return file.toBlob(blob.type);
}
