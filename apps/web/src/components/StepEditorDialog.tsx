import {useId,useState,useRef,useLayoutEffect,type ReactNode} from 'react';
import {IconDeviceFloppy} from '@tabler/icons-react';
import {useTranslation} from '../i18n.js';
import {SettingsDialog} from './SettingsDialog.js';

interface Props {number:number;changed:boolean;busy:boolean;children:ReactNode;onApply():void;onCancel():void}
export function StepEditorDialog({number,changed,busy,children,onApply,onCancel}:Props){
 const {t}=useTranslation('cases');const [confirming,setConfirming]=useState(false),formId=useId();
 const resume=useRef<HTMLButtonElement>(null),previousFocus=useRef<HTMLElement|null>(null);
 useLayoutEffect(()=>{if(confirming)resume.current?.focus();},[confirming]);
 function close(){if(busy||confirming)return;if(changed){previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setConfirming(true);}else onCancel();}
 return <SettingsDialog open title={`${t('stepParameters')} ${number}`} closeLabel={t('closeParameters')} onClose={close} busy={busy} dismissOnBackdrop={false} className="step-editor-dialog" footer={<div className="step-editor-footer">
  {confirming?<><p role="alert">{t('discardStepPrompt')}</p><div className="settings-actions"><button ref={resume} type="button" onClick={()=>{setConfirming(false);requestAnimationFrame(()=>previousFocus.current?.focus());}}>{t('continueStep')}</button><button type="button" onClick={onCancel}>{t('discardStep')}</button></div></>:<div className="settings-actions"><button type="button" disabled={busy} onClick={close}>{t('cancel')}</button><button className="primary" type="submit" form={formId} disabled={busy||!changed}><IconDeviceFloppy aria-hidden="true"/>{t('saveStep')}</button></div>}
 </div>}>
 <form id={formId} noValidate onSubmit={event=>{event.preventDefault();if(!busy&&!confirming)onApply();}}><fieldset className="case-step-parameters" disabled={busy||confirming}>{children}</fieldset></form>
 </SettingsDialog>;
}
