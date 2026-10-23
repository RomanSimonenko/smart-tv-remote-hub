import {useTranslation,useUiMessage,m} from '../i18n.js';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {testCaseDraftSchema,type TestCaseDraft} from '@remote-webos-tv/contracts';
import {IconUpload,IconFileText} from '@tabler/icons-react';
import {SettingsDialog} from './SettingsDialog.js';
import {BDD_MAX_BYTES,parseBddScenario,type ImportedScenario} from '../bdd-import.js';
interface Props {onClose():void;onImport(draft:TestCaseDraft):void}
export function BddImportDialog({onClose,onImport}:Props){ const {t}=useTranslation('cases');
 const [title,setTitle]=useState(''),[source,setSource]=useState('');
 const [error,setError]=useUiMessage();
 const [preview,setPreview]=useState<ImportedScenario|null>(null),[reading,setReading]=useState(false);
 const [suggestedTitle,setSuggestedTitle]=useState('');
 const [confirmClose,setConfirmClose]=useState(false);
 const continueRef=useRef<HTMLButtonElement>(null), cancelRef=useRef<HTMLButtonElement>(null), closeTrigger=useRef<HTMLElement|null>(null);
 useLayoutEffect(()=>{if(confirmClose)continueRef.current?.focus();else if(closeTrigger.current){if(closeTrigger.current.isConnected)closeTrigger.current.focus();else cancelRef.current?.focus();}},[confirmClose]);
 const fileRef=useRef<HTMLInputElement>(null);const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(title||source){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[title,source]);
 function close(){if(reading)return;if(title||source){closeTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setConfirmClose(true);}else onClose();}
 function replace(value:string){setSource(value);setPreview(null);setError('');}
 const validTitle=testCaseDraftSchema.shape.title.safeParse(title).success;
 return <SettingsDialog open title={t('importTitle')} closeLabel={t('closeImport')} onClose={()=>{if(confirmClose)setConfirmClose(false);else close();}} busy={reading} footer={confirmClose?<div className="bdd-import-actions"><button ref={continueRef} onClick={()=>setConfirmClose(false)}>{t('continueEditing')}</button><button onClick={onClose}>{t('discardClose')}</button></div>:<div className="bdd-import-actions"><button ref={cancelRef} onClick={close} disabled={reading}>{t('cancel')}</button><button className="primary" disabled={!preview||!validTitle||reading} onClick={()=>{if(!preview)return;const draft=testCaseDraftSchema.parse({title,description:'',group:'',steps:preview.steps.map(step=>({...step,id:crypto.randomUUID()}))});onImport(draft);}}>{t('openEditor')}</button></div>}>
 {confirmClose&&<p role="alert" className="bdd-close-confirmation">{t('discardImport')}</p>}
 <div className="bdd-import" hidden={confirmClose}>
 <p>{t('importIntro')}</p>
 <label>{t('name')}<input value={title} onChange={event=>setTitle(event.target.value)} maxLength={200}/></label>
 <label>{t('sourceText')}<span className="textarea-frame"><textarea spellCheck={false} value={source} onChange={event=>replace(event.target.value)} disabled={reading}/></span></label>
 <p className="profile-caption">{t('importPrivacy')}</p>
 <input ref={fileRef} type="file" accept=".js,.ts,text/javascript,text/plain" aria-label={t('scenarioFile')} className="bdd-file" onChange={async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(!/\.(js|ts)$/i.test(file.name)){setError(m('cases','fileTypeError'));return;}
  if(file.size>BDD_MAX_BYTES){setError(m('cases','fileSizeError'));return;}
  if(source&&!window.confirm(t('replaceSource')))return;
  setReading(true);setError('');try{const value=await file.text();if(alive.current)replace(value);}catch{if(alive.current)setError(m('cases','fileReadError'));}finally{if(alive.current)setReading(false);}
 }}/>
 <div className="bdd-import-actions"><button type="button" disabled={reading} onClick={()=>fileRef.current?.click()}><IconUpload aria-hidden="true"/>{reading?t('reading'):t('chooseFile')}</button><button type="button" disabled={reading} onClick={()=>{try{const result=parseBddScenario(source);setPreview(result);if(result.title&&(title===''||title===suggestedTitle)){setTitle(result.title);setSuggestedTitle(result.title);}setError('');}catch(cause){setPreview(null);setError(()=>(cause as Error).message);}}}>{t('check')}</button></div>
 {error&&<p role="alert" className="error">{error}</p>}
 {preview&&<section aria-label={t('importPreview')}><h3>{t('previewTitle',{count:preview.steps.length})}</h3>{preview.ignoredCallbacks>0&&<p role="status">{t('ignoredCallbacks',{count:preview.ignoredCallbacks})}</p>}<ol className="bdd-preview">{preview.steps.map((step,index)=><li key={index}><IconFileText aria-hidden="true"/><strong>{t(step.kind)}</strong><span>{step.text}</span></li>)}</ol></section>}
 </div></SettingsDialog>;
}
