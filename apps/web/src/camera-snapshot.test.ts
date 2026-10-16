import {expect,test,vi} from 'vitest';
import {captureCameraFrame} from './camera-snapshot.js';
test('camera capture refuses a missing or stopped stream',async()=>{
 const video=document.createElement('video');
 await expect(captureCameraFrame(video,null,new AbortController().signal,'Camera')).rejects.toMatchObject({code:'CAMERA_NOT_READY'});
});
test('capture times out instead of accepting a stale preview frame and cleans up on abort',async()=>{
 vi.useFakeTimers();try{
 const video=document.createElement('video');Object.defineProperties(video,{videoWidth:{value:640},videoHeight:{value:480},readyState:{value:2}});
 video.requestVideoFrameCallback=()=>1;video.cancelVideoFrameCallback=()=>{};
 const track={readyState:'live',addEventListener(){},removeEventListener(){}};const stream={getVideoTracks:()=>[track]} as unknown as MediaStream;
 const pending=captureCameraFrame(video,stream,new AbortController().signal,'Camera');const rejected=expect(pending).rejects.toMatchObject({code:'CAMERA_FRAME_TIMEOUT'});await vi.advanceTimersByTimeAsync(5000);await rejected;
 const controller=new AbortController();const cancelled=captureCameraFrame(video,stream,controller.signal,'Camera');controller.abort();await expect(cancelled).rejects.toMatchObject({name:'AbortError'});expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
});
