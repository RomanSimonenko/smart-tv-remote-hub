import {useEffect,useRef,useState} from 'react';
import type {StartTestRun,TestRun} from '@remote-webos-tv/contracts';
import {api,ApiFailure,friendlyError} from './api.js';
import {CameraCaptureError,type CameraSnapshot} from './camera-snapshot.js';
import {executeTestRun} from './run-execution.js';
export function useTestRun(csrfToken:string,onSessionExpired:()=>void){
 const [run,setRun]=useState<TestRun|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=useRef<{controller:AbortController;id:string}|null>(null),mounted=useRef(true),heartbeat=useRef<ReturnType<typeof setInterval>|null>(null);
 const expired=useRef(onSessionExpired);expired.current=onSessionExpired;
 function update(value:TestRun){if(mounted.current)setRun(value);}
 function finish(controller:AbortController){if(active.current?.controller!==controller)return;if(heartbeat.current)clearInterval(heartbeat.current);heartbeat.current=null;active.current=null;if(mounted.current)setBusy(false);}
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current?.controller.abort();if(heartbeat.current)clearInterval(heartbeat.current);};},[]);
 async function start(input:StartTestRun,capture:(signal:AbortSignal)=>Promise<CameraSnapshot>){
  if(active.current)return;const controller=new AbortController();active.current={controller,id:input.id};setBusy(true);setError('');
  try{
   const initial=await api.startTestRun(input,csrfToken,AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]));update(initial);
   if(initial.status!=='running'){finish(controller);return;}
   let pinging=false;
   heartbeat.current=setInterval(()=>{if(pinging||controller.signal.aborted)return;pinging=true;void api.runAction(input.id,'heartbeat',csrfToken,undefined,AbortSignal.any([controller.signal,AbortSignal.timeout(5000)])).then(value=>{if(value.status!=='running'){update(value);controller.abort();}}).catch(cause=>{if(!controller.signal.aborted){if(cause instanceof ApiFailure&&cause.status===401)expired.current();setError('Связь с сервером потеряна. Дальнейшие команды остановлены.');controller.abort();}}).finally(()=>{pinging=false;});},5000);
   await executeTestRun(initial,{signal:controller.signal,capture,onUpdate:update,advance:(id,itemId)=>api.runAction(id,'advance',csrfToken,{itemId},AbortSignal.any([controller.signal,AbortSignal.timeout(70000)])),upload:(id,itemId,snapshot)=>api.saveRunSnapshot(id,itemId,snapshot,csrfToken,controller.signal)});
  }catch(cause){
   if(cause instanceof ApiFailure&&cause.status===401)expired.current();
   if(!controller.signal.aborted&&mounted.current)setError(cause instanceof CameraCaptureError?`Не удалось получить свежий снимок (${cause.code}). Запуск остановлен.`:friendlyError(cause));
   if(!controller.signal.aborted){try{update(await api.runAction(input.id,'failure',csrfToken,{stage:cause instanceof CameraCaptureError?'camera':'connection',code:cause instanceof CameraCaptureError?cause.code:'CLIENT_REQUEST_FAILED'},AbortSignal.timeout(10000)));}catch{if(mounted.current)setError(value=>`${value} Не удалось подтвердить остановку: сервер завершит запуск при потере связи.`);}}
  }finally{finish(controller);}
 }
 async function stop(){const current=active.current;if(!current)return;current.controller.abort();try{update(await api.runAction(current.id,'stop',csrfToken,undefined,AbortSignal.timeout(10000)));}catch(cause){if(cause instanceof ApiFailure&&cause.status===401)expired.current();if(mounted.current)setError('Не удалось подтвердить остановку. Сервер завершит запуск при потере связи.');}finally{finish(current.controller);}}
 return {run,busy,error,start,stop,reset(){if(!active.current){setRun(null);setError('');}}};
}
