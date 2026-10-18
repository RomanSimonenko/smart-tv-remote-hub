import type {CameraPrior} from '@remote-webos-tv/contracts';
import {api,ApiFailure} from './api.js';
import {CameraCaptureError,type CameraSnapshot} from './camera-snapshot.js';
export async function rectifyCameraSnapshot(snapshot:CameraSnapshot,prior:CameraPrior|undefined,signal:AbortSignal):Promise<CameraSnapshot>{
 signal.throwIfAborted();
 if(!prior)throw new CameraCaptureError('SCREEN_NOT_FOUND');
 try{
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(10000)]);
  const session=await api.session(bounded);
  const result=await api.cameraSnapshot(snapshot.blob,session.csrfToken,prior,bounded);
  signal.throwIfAborted();
  if(result.status!=='found')throw new CameraCaptureError('SCREEN_NOT_FOUND');
  const bytes=Uint8Array.from(atob(result.image),c=>c.charCodeAt(0));
  return {...snapshot,blob:new Blob([bytes],{type:'image/jpeg'})};
 }catch(cause){
  signal.throwIfAborted();
  if(cause instanceof CameraCaptureError||cause instanceof ApiFailure&&cause.status===401)throw cause;
  throw new CameraCaptureError('SCREEN_PROCESSING_FAILED');
 }
}
