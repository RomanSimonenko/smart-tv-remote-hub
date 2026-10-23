import { i18n, useUiMessage } from './i18n.js';
import {useCallback,useEffect,useRef,useState} from 'react';
import {finalizeCameraRecording} from './finalize-camera-recording.js';

type Download={url:string;name:string;partial:boolean};
type Session={recorder:MediaRecorder;chunks:Blob[];bytes:number;model:string;cancelled:boolean;stoppedTick:number|null;startedAt:number;startedTick:number;timer:ReturnType<typeof setInterval>|undefined;stopRequested:boolean;failed:boolean};
export const recordingLimits={durationMs:5*60_000,bytes:128*1024*1024};
export const recordingLimitLabel=()=>i18n.t('recordingLimit', { ns: 'devices', minutes: recordingLimits.durationMs/60_000, megabytes: recordingLimits.bytes/1024/1024 });
const formats=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
// Keep the URL alive during the browser's download handoff after leaving the page.
const downloadHandoffMs=60_000;
function releaseDownload(file:Download|null){if(file)setTimeout(()=>URL.revokeObjectURL(file.url),downloadHandoffMs);}
function recordingError(message:string,cause:unknown){return `${message}${cause instanceof Error||cause instanceof DOMException?` (${cause.name})`:''}.`;}
function filenameModel(model:string){return model.replace(/[<>:"/\\|?*\u0000-\u001f\u007f\s]+/g,'-').replace(/-+/g,'-').replace(/^[.\-]+|[.\-]+$/g,'').slice(0,100)||'tv-camera';}

export function useCameraRecording(){
 const supported=typeof MediaRecorder!=='undefined';
 const [phase,setPhase]=useState<'idle'|'recording'|'stopping'>('idle');
 const [elapsed,setElapsed]=useState(0),[error,setError]=useUiMessage();
 const [notice,setNotice]=useUiMessage();
 const [download,setDownload]=useState<Download|null>(null);
 const active=useRef<Session|null>(null),file=useRef<Download|null>(null),mounted=useRef(true);
 const stop=useCallback(()=>{
  const session=active.current;if(!session||session.stopRequested)return;
  session.stopRequested=true;session.stoppedTick=performance.now();
  if(mounted.current)setPhase('stopping');
  try{if(session.recorder.state!=='inactive')session.recorder.stop();}
  catch(cause){session.stopRequested=false;if(mounted.current){setPhase('recording');setError(() => (recordingError(i18n.t('recordingStopFailed', { ns: 'devices' }),cause)));}}
 },[]);
 const cancel=useCallback(()=>{
  const session=active.current;if(!session)return;
  session.cancelled=true;session.chunks=[];stop();
 },[stop]);
 useEffect(()=>{
  mounted.current=true;
  const beforeUnload=(event:BeforeUnloadEvent)=>{if(active.current){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  return()=>{mounted.current=false;stop();const session=active.current;if(session?.timer!==undefined)clearInterval(session.timer);releaseDownload(file.current);file.current=null;window.removeEventListener('beforeunload',beforeUnload);};
 },[stop]);

 function start(stream:MediaStream,model=''){
  if(active.current)return;
  setError('');setNotice('');setElapsed(0);
  let recorder:MediaRecorder;
  try{
   if(!supported)throw new DOMException('Recording unavailable','NotSupportedError');
   const mimeType=formats.find(type=>MediaRecorder.isTypeSupported(type));
   if(!mimeType)throw new DOMException('No supported video format','NotSupportedError');
   recorder=new MediaRecorder(stream,{mimeType});
  }catch(cause){setError(() => (recordingError(i18n.t('recordingStartFailed', { ns: 'devices' }),cause)));return;}
  const session:Session={recorder,chunks:[],bytes:0,model:filenameModel(model),cancelled:false,stoppedTick:null,startedAt:Date.now(),startedTick:performance.now(),timer:undefined,stopRequested:false,failed:false};
  const data=(event:BlobEvent)=>{if(event.data.size&&!session.cancelled){session.chunks.push(event.data);session.bytes+=event.data.size;if(session.bytes>=recordingLimits.bytes&&!session.stopRequested){if(mounted.current)setNotice(() => (i18n.t('recordingSizeLimit', { ns: 'devices', megabytes: recordingLimits.bytes/1024/1024 })));stop();}}};
  const failure=(event:Event)=>{
   session.failed=true;
   if(mounted.current)setError(() => (recordingError(i18n.t('recordingInterrupted', { ns: 'devices' }),(event as Event&{error?:DOMException}).error)));
   stop();
  };
  const detach=()=>{if(session.timer!==undefined)clearInterval(session.timer);recorder.removeEventListener('dataavailable',data);recorder.removeEventListener('error',failure);recorder.removeEventListener('stop',finish);};
  const discard=()=>{
   if(!session.cancelled)return false;
   session.chunks=[];active.current=null;
   if(mounted.current){setPhase('idle');setError('');setNotice(() => (i18n.t('recordingCancelled', { ns: 'devices' })));}
   return true;
  };
  const finish=async()=>{
   if(active.current!==session)return;
   detach();
   if(discard())return;
   let blob=new Blob(session.chunks,{type:recorder.mimeType});session.chunks=[];
   if(!blob.size){active.current=null;if(mounted.current){setPhase('idle');setError(() => (i18n.t('recordingEmpty', { ns: 'devices' })));}return;}
   if(mounted.current)setPhase('stopping');
   try{blob=await finalizeCameraRecording(blob,(session.stoppedTick??performance.now())-session.startedTick);}
   catch(cause){if(mounted.current&&!session.cancelled)setError(() => (recordingError(i18n.t('recordingMetadataFailed', { ns: 'devices' }),cause)));}
   if(discard())return;
   active.current=null;if(mounted.current)setPhase('idle');
   let result:Download;
   try{
    result={url:URL.createObjectURL(blob),name:`${session.model}-${new Date(session.startedAt).toISOString().replace(/[.:]/g,'-')}.${recorder.mimeType.startsWith('video/mp4')?'mp4':'webm'}`,partial:session.failed};
   }catch(cause){if(mounted.current)setError(() => (recordingError(i18n.t('recordingPrepareFailed', { ns: 'devices' }),cause)));return;}
   if(mounted.current){releaseDownload(file.current);file.current=result;setDownload(result);}else releaseDownload(result);
   const link=document.createElement('a');link.href=result.url;link.download=result.name;link.hidden=true;
   try{document.body.append(link);link.click();}
   catch(cause){if(mounted.current)setError(() => (recordingError(i18n.t('recordingDownloadFailed', { ns: 'devices' }),cause)));}
   finally{link.remove();}
  };
  recorder.addEventListener('dataavailable',data);recorder.addEventListener('error',failure);recorder.addEventListener('stop',finish);
  active.current=session;
  try{
   recorder.start(1000);
   setPhase('recording');
   session.timer=setInterval(()=>{const duration=performance.now()-session.startedTick;if(mounted.current)setElapsed(Math.floor(duration/1000));if(duration>=recordingLimits.durationMs&&!session.stopRequested){if(mounted.current)setNotice(() => (i18n.t('recordingDurationLimit', { ns: 'devices', minutes: recordingLimits.durationMs/60_000 })));stop();}},1000);
  }catch(cause){detach();active.current=null;setError(() => (recordingError(i18n.t('recordingStartFailed', { ns: 'devices' }),cause)));}
 }
 return{supported,phase,elapsed,error,notice,download,start,stop,cancel,isActive:()=>active.current!==null};
}
