import {useEffect,useRef,useState} from 'react';
import {testCaseDraftSchema,type TestCaseDraft} from '@remote-webos-tv/contracts';
import {IconUpload,IconFileText} from '@tabler/icons-react';
import {SettingsDialog} from './SettingsDialog.js';
import {BDD_MAX_BYTES,parseBddScenario,type ImportedScenario} from '../bdd-import.js';
interface Props {onClose():void;onImport(draft:TestCaseDraft):void}
const labels={given:'Дано',when:'Когда',then:'Тогда'};
export function BddImportDialog({onClose,onImport}:Props){
 const [title,setTitle]=useState(''),[source,setSource]=useState(''),[error,setError]=useState('');
 const [preview,setPreview]=useState<ImportedScenario|null>(null),[reading,setReading]=useState(false);
 const [suggestedTitle,setSuggestedTitle]=useState('');
 const [confirmClose,setConfirmClose]=useState(false);
 const fileRef=useRef<HTMLInputElement>(null);const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(title||source){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[title,source]);
 function close(){if(reading)return;if(title||source)setConfirmClose(true);else onClose();}
 function replace(value:string){setSource(value);setPreview(null);setError('');}
 const validTitle=testCaseDraftSchema.shape.title.safeParse(title).success;
 return <SettingsDialog open title="Импорт тест-кейса" closeLabel="Закрыть импорт" onClose={close} busy={reading}>
 <div className="bdd-import">
 <p>Вставьте текст одного тест-кейса или выберите файл для импорта.</p>
 <label>Название<input value={title} onChange={event=>setTitle(event.target.value)} maxLength={200}/></label>
 <label>Исходный текст<textarea spellCheck={false} value={source} onChange={event=>replace(event.target.value)} disabled={reading}/></label>
 <p className="profile-caption">Один сценарий, до 64 КиБ. Файл и исходный код остаются в этом браузере.</p>
 <input ref={fileRef} type="file" accept=".js,.ts,text/javascript,text/plain" aria-label="Файл сценария" className="bdd-file" onChange={async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(!/\.(js|ts)$/i.test(file.name)){setError('Выберите текстовый файл .js или .ts.');return;}
  if(file.size>BDD_MAX_BYTES){setError('Файл превышает 64 КиБ.');return;}
  if(source&&!window.confirm('Заменить введённый исходный текст содержимым файла?'))return;
  setReading(true);setError('');try{const value=await file.text();if(alive.current)replace(value);}catch{if(alive.current)setError('Не удалось прочитать файл. Выберите его повторно.');}finally{if(alive.current)setReading(false);}
 }}/>
 <div className="bdd-import-actions"><button type="button" disabled={reading} onClick={()=>fileRef.current?.click()}><IconUpload aria-hidden="true"/>{reading?'Чтение…':'Выбрать файл'}</button><button type="button" disabled={reading} onClick={()=>{try{const result=parseBddScenario(source);setPreview(result);if(result.title&&(title===''||title===suggestedTitle)){setTitle(result.title);setSuggestedTitle(result.title);}setError('');}catch(cause){setPreview(null);setError((cause as Error).message);}}}>Проверить</button></div>
 {error&&<p role="alert" className="error">{error}</p>}
 {preview&&<section aria-label="Предпросмотр импорта"><h3>Предпросмотр · {preview.steps.length}</h3>{preview.ignoredCallbacks>0&&<p role="status">Функции при шагах пропущены: {preview.ignoredCallbacks}. Импортированы только описания; код и комментарии внутри функций не переносятся.</p>}<ol className="bdd-preview">{preview.steps.map((step,index)=><li key={index}><IconFileText aria-hidden="true"/><strong>{labels[step.kind]}</strong><span>{step.text}</span></li>)}</ol></section>}
 {confirmClose?<div role="alert"><p>Закрыть импорт и потерять введённые данные?</p><div className="bdd-import-actions"><button onClick={()=>setConfirmClose(false)}>Продолжить редактирование</button><button onClick={onClose}>Закрыть без сохранения</button></div></div>:<div className="bdd-import-actions"><button onClick={close} disabled={reading}>Отмена</button><button className="primary" disabled={!preview||!validTitle||reading} onClick={()=>{if(!preview)return;const draft=testCaseDraftSchema.parse({title,description:'',group:'',steps:preview.steps.map(step=>({...step,id:crypto.randomUUID()}))});onImport(draft);}}>Открыть в редакторе</button></div>}
 </div></SettingsDialog>;
}
