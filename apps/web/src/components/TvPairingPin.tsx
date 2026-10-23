import { i18n, useTranslation } from '../i18n.js';
import {useEffect,useRef,useState} from 'react';
interface Props {operationId:string;expiresAt:number;busy:boolean;onSubmit(pin:string):void|Promise<void>;onCancel():void}
export function TvPairingPin({operationId,expiresAt,busy,onSubmit,onCancel}:Props){
  useTranslation('devices');
 const [pin,setPin]=useState(''),[now,setNow]=useState(Date.now),[sending,setSending]=useState(false);
 const input=useRef<HTMLInputElement>(null),pending=useRef(false);
 useEffect(()=>{setPin('');setSending(false);pending.current=false;input.current?.focus();},[operationId,expiresAt]);
 useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer);},[expiresAt]);
 const remaining=Math.max(0,Math.ceil((expiresAt-now)/1000));
 async function submit(){if(pending.current||busy||remaining===0||!/^[0-9]{4}$/.test(pin))return;pending.current=true;setSending(true);const value=pin;setPin('');try{await onSubmit(value);}finally{pending.current=false;setSending(false);}}
 return <form noValidate onSubmit={event=>{event.preventDefault();void submit();}}>
  <p>{i18n.t('pinHint', { ns: 'devices' })}</p>
  <label>{i18n.t('pinLabel', { ns: 'devices' })}<input ref={input} type="text" inputMode="numeric" autoComplete="off" maxLength={4} pattern="[0-9]{4}" value={pin} disabled={busy||sending||remaining===0} onChange={event=>setPin(event.target.value)}/></label>
  <p>{remaining>0?i18n.t('remaining', { ns: 'devices', seconds: remaining }):i18n.t('pinExpired', { ns: 'devices' })}</p>
  <div className="settings-actions"><button type="submit" disabled={busy||sending||remaining===0||!/^[0-9]{4}$/.test(pin)}>{sending?i18n.t('confirming', { ns: 'devices' }):i18n.t('confirm', { ns: 'devices' })}</button><button type="button" disabled={busy||sending} onClick={onCancel}>{i18n.t('cancelAction', { ns: 'devices' })}</button></div>
 </form>;
}
