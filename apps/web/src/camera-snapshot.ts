export class CameraCaptureError extends Error {
 constructor(readonly code:'CAMERA_NOT_READY'|'CAMERA_FRAME_TIMEOUT'|'CAMERA_CAPTURE_UNSUPPORTED'|'CAMERA_ENCODE_FAILED'){super(code);}
}
export interface CameraSnapshot {blob:Blob;capturedAt:number;cameraLabel:string}
export function captureCameraFrame(video:HTMLVideoElement,stream:MediaStream|null,signal:AbortSignal,cameraLabel:string):Promise<CameraSnapshot>{
 const track=stream?.getVideoTracks()[0];
 if(!track||track.readyState!=='live'||video.readyState<2||!video.videoWidth||!video.videoHeight)return Promise.reject(new CameraCaptureError('CAMERA_NOT_READY'));
 if(!video.requestVideoFrameCallback)return Promise.reject(new CameraCaptureError('CAMERA_CAPTURE_UNSUPPORTED'));
 return new Promise((resolve,reject)=>{
  let frame:number|undefined;let settled=false;
  const cleanup=()=>{clearTimeout(timer);if(frame!==undefined)video.cancelVideoFrameCallback(frame);signal.removeEventListener('abort',abort);track.removeEventListener('ended',ended);};
  const fail=(cause:unknown)=>{if(settled)return;settled=true;cleanup();reject(cause);};
  const abort=()=>fail(signal.reason instanceof CameraCaptureError?signal.reason:new DOMException('Capture cancelled','AbortError'));
  const ended=()=>fail(new CameraCaptureError('CAMERA_NOT_READY'));
  const timer=setTimeout(()=>fail(new CameraCaptureError('CAMERA_FRAME_TIMEOUT')),5000);
  signal.addEventListener('abort',abort,{once:true});track.addEventListener('ended',ended,{once:true});
  if(signal.aborted){abort();return;}
  frame=video.requestVideoFrameCallback(()=>{
   frame=undefined;
   if(track.readyState!=='live'||!video.videoWidth||!video.videoHeight){ended();return;}
   const capturedAt=Date.now();const scale=Math.min(1,1920/Math.max(video.videoWidth,video.videoHeight));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
   try{const context=canvas.getContext('2d');if(!context)throw new CameraCaptureError('CAMERA_ENCODE_FAILED');context.drawImage(video,0,0,canvas.width,canvas.height);
    canvas.toBlob(blob=>{if(settled)return;if(!blob){fail(new CameraCaptureError('CAMERA_ENCODE_FAILED'));return;}settled=true;cleanup();resolve({blob,capturedAt,cameraLabel});},'image/jpeg',.9);
   }catch(cause){fail(cause instanceof CameraCaptureError?cause:new CameraCaptureError('CAMERA_ENCODE_FAILED'));}
  });
 });
}
