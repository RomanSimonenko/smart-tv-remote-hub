import {useEffect,useState} from 'react';
import {IconDatabase,IconDeviceDesktop,IconActivity} from '@tabler/icons-react';
import {useTranslation} from '../i18n.js';
import {LanguageSelect} from '../components/LanguageSelect.js';
import {SettingsDialog} from '../components/SettingsDialog.js';
import {StorageSettings} from './StorageSettings.js';
import {DiagnosticsSettings} from './DiagnosticsSettings.js';

export interface SettingsProps {csrfToken:string;onSessionExpired():void;onDirtyChange(dirty:boolean):void}
type Section='interface'|'storage'|'diagnostics';
export function Settings(props:SettingsProps){
 const {t}=useTranslation('settings'),{t:common}=useTranslation('common');
 const [section,setSection]=useState<Section>('interface'),[dirty,setDirty]=useState(false),[pending,setPending]=useState<Section|null>(null);
 useEffect(()=>{props.onDirtyChange(dirty);},[dirty,props.onDirtyChange]);
 const sections=[['interface',IconDeviceDesktop],['storage',IconDatabase],['diagnostics',IconActivity]] as const;
 function select(next:Section){if(next===section)return;if(dirty)setPending(next);else setSection(next);}
 return <section className="app-settings"><h1>{t('title')}</h1><div className="app-settings-layout">
  <nav className="app-settings-nav" aria-label={t('navigation')}>{sections.map(([name,Icon])=><button key={name} type="button" aria-current={section===name?'page':undefined} onClick={()=>select(name)}><Icon aria-hidden="true"/>{t(name)}</button>)}</nav>
  <div className="app-settings-panel">
   {section==='interface'?<><h2>{t('interface')}</h2><LanguageSelect/><p className="settings-muted">{common('languageDescription')}</p></>:section==='storage'?<StorageSettings {...props} onDirtyChange={setDirty}/>:<DiagnosticsSettings onSessionExpired={props.onSessionExpired}/>}
  </div>
 </div><SettingsDialog open={pending!==null} title={common('unsavedChanges')} closeLabel={common('closeDialog')} onClose={()=>setPending(null)}><p>{t('unsaved')}</p><div className="settings-actions"><button type="button" onClick={()=>setPending(null)}>{t('stay')}</button><button type="button" onClick={()=>{if(pending){setDirty(false);setSection(pending);setPending(null);}}}>{t('discard')}</button></div></SettingsDialog></section>;
}
