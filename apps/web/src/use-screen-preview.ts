import {useEffect,useState,useRef,type RefObject} from 'react';
import {LiveScreenGate,type CameraPrior} from '@remote-webos-tv/contracts';
import {api} from './api.js';

export function useScreenPreview(video:RefObject<HTMLVideoElement|null>,active:boolean){
 const confirmed=useRef<{prior:CameraPrior;at:number}|null>(null);
 const searchPrior=useRef<CameraPrior|undefined>(undefined);
 const [observations,setObservations]=useState<Array<{at:number;latencyMs:number;status:string;visible:boolean}>>([]);
 const [image,setImage]=useState(''),[message,setMessage]=useState('Экран не найден');
 useEffect(()=>{
  confirmed.current=null;searchPrior.current=undefined;setObservations([]);setImage('');setMessage('Ищем экран…');if(!active)return;
  const controller=new AbortController(),gate=new LiveScreenGate();let frame:number|undefined,prior:CameraPrior|undefined,disposed=false,earliest=0;
  const expire=setInterval(()=>{if(!gate.visible(performance.now())){setImage('');if(confirmed.current){confirmed.current=null;setMessage('Обновляем изображение…');}}},100);
  const schedule=(token:string)=>{if(!disposed&&video.current)frame=video.current.requestVideoFrameCallback(()=>{frame=undefined;if(performance.now()<earliest){schedule(token);return;}earliest=performance.now()+100;void process(token);});};
  const process=async(token:string)=>{
   if(disposed||!video.current||document.hidden)return;
   const started=performance.now();
   try{
    const source=video.current,canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(source.videoWidth,source.videoHeight));
    canvas.width=Math.round(source.videoWidth*scale);canvas.height=Math.round(source.videoHeight*scale);
    if(!canvas.width||!canvas.height)throw new Error('Камера не выдаёт изображение');
    const context=canvas.getContext('2d');if(!context)throw new Error('Видеообработка недоступна');context.drawImage(source,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Не удалось обработать кадр')),'image/png'));
    if(disposed)return;
    const result=await api.cameraPreview(blob,token,prior,AbortSignal.any([controller.signal,AbortSignal.timeout(6000)]));
    if(disposed)return;
    const fresh=performance.now()-started<=1000;
    if(result.status==='found'){prior=result.prior;
     const stable=gate.observe(result.prior.corners,started);
     if(fresh&&stable&&gate.visible(performance.now())){confirmed.current={prior:result.prior,at:started};searchPrior.current=result.prior;setImage('data:image/png;base64,'+result.image);setMessage('');}
     else{confirmed.current=null;setImage('');setMessage(fresh?'Подтверждаем границы экрана…':'Обновляем изображение…');}
    }else{confirmed.current=null;gate.observe(null,started);setImage('');setMessage('Экран не найден');}
    setObservations(values=>[...values.slice(-59),{at:Math.round(started),latencyMs:Math.round(performance.now()-started),status:result.status,visible:gate.visible(performance.now())}]);
    schedule(token);
   }catch{if(!disposed){confirmed.current=null;setImage('');setMessage('Не удалось обработать видео. Переключитесь на исходное или включите режим снова.');}}
  };
  if(!video.current?.requestVideoFrameCallback){setMessage('Выделение экрана недоступно в этом браузере');}
  else void api.session(controller.signal).then(session=>{if(!disposed)schedule(session.csrfToken);}).catch(()=>{if(!disposed)setMessage('Сессия недоступна. Войдите в приложение снова.');});
  return()=>{disposed=true;confirmed.current=null;searchPrior.current=undefined;controller.abort();clearInterval(expire);if(frame!==undefined)video.current?.cancelVideoFrameCallback(frame);};
 },[active,video]);
 // Search identity is never an accepted crop. Every snapshot revalidates all
 // boundaries on its newly captured source frame before returning any pixels.
 return{image,message,observations,getSearchPrior:()=>searchPrior.current};
}
