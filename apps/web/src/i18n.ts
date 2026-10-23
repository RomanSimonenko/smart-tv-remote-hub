import {createInstance,type i18n as I18nInstance} from 'i18next';
import {initReactI18next,useTranslation} from 'react-i18next';
import {useState,useSyncExternalStore} from 'react';
import * as common from './locales/common.js';
import * as devices from './locales/devices.js';
import * as cases from './locales/cases.js';
import * as runs from './locales/runs.js';
import * as auth from './locales/auth.js';
import * as settings from './locales/settings.js';

export type Language='ru'|'en';
export type Namespace='common'|'devices'|'cases'|'runs'|'auth'|'settings';
export const resources={ru:{common:common.ru,devices:devices.ru,cases:cases.ru,runs:runs.ru,auth:auth.ru,settings:settings.ru},en:{common:common.en,devices:devices.en,cases:cases.en,runs:runs.en,auth:auth.en,settings:settings.en}};
const storageKey='smart-tv-remote-hub.locale.v1';
let storageError='';
export function readLanguage():Language{
 try{const value=localStorage.getItem(storageKey);return value==='en'?'en':'ru';}
 catch{storageError='languageReadError';return 'ru';}
}
export const i18n:I18nInstance=createInstance();
void i18n.use(initReactI18next).init({resources,lng:readLanguage(),fallbackLng:'ru',supportedLngs:['ru','en'],defaultNS:'common',interpolation:{escapeValue:false},react:{useSuspense:false},initAsync:false});
const listeners=new Set<()=>void>();
let revision=0;
function notify(){revision++;for(const listener of listeners)listener();}
function updateDocument(){if(typeof document!=='undefined')document.documentElement.lang=i18n.language==='en'?'en':'ru';}
i18n.on('languageChanged',()=>{updateDocument();notify();});updateDocument();
export async function setLanguage(language:Language){
 if(language!=='ru'&&language!=='en')return;
 storageError='';
 try{localStorage.setItem(storageKey,language);}catch{storageError='languageSaveError';}
 await i18n.changeLanguage(language);notify();
}
export function useLanguage(){
 useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>revision);
 const {t}=useTranslation('common');
 return {language:(i18n.language==='en'?'en':'ru') as Language,setLanguage,error:storageError?t(storageError):''};
}
export function formatLocale(){return i18n.language==='en'?'en-US':'ru-RU';}
/** Deferred UI messages stay translatable after asynchronous work completes. */
export type UiMessage=string|(()=>string);
export function m(namespace:Namespace,key:string,values:Record<string,unknown>={}):()=>string{return ()=>i18n.t(key,{ns:namespace,...values}) as string;}
export function useUiMessage(initial:UiMessage=''){
 useTranslation();
 const [value,setValue]=useState<UiMessage>(()=>initial);
 return [typeof value==='function'?value():value,(next:UiMessage)=>setValue(()=>next)] as const;
}
export {useTranslation};
