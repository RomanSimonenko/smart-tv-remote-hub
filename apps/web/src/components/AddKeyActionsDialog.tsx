import {useLayoutEffect,useRef,useState} from 'react';
import {IconPower,IconTrash} from '@tabler/icons-react';
import {DEFAULT_KEY_PAUSE_MS,MAX_STEP_KEY_ACTIONS,getTvAction,type TestCaseKeyAction,type TvActionId} from '@remote-webos-tv/contracts';
import {RemoteLayout} from './RemoteLayout.js';
import {SettingsDialog} from './SettingsDialog.js';

interface Props {remaining:number;onApply(actions:TestCaseKeyAction[]):void;onClose():void}
export function AddKeyActionsDialog({remaining,onApply,onClose}:Props){
 const [actions,setActions]=useState<TestCaseKeyAction[]>([]);
 const applying=useRef(false),queue=useRef<HTMLOListElement>(null);
 useLayoutEffect(()=>{if(queue.current)queue.current.scrollTop=queue.current.scrollHeight;},[actions.length]);
 const full=actions.length>=remaining;
 function add(action:TvActionId){
  setActions(current=>current.length>=remaining?current:[...current,{id:crypto.randomUUID(),action,pauseAfterMs:DEFAULT_KEY_PAUSE_MS}]);
 }
 return <SettingsDialog open title="Добавить нажатия" closeLabel="Закрыть добавление нажатий" onClose={onClose} dismissOnBackdrop={false} className="key-actions-dialog" footer={<>
  <button type="button" onClick={onClose}>Отмена</button>
  <button type="button" className="primary" disabled={!actions.length} onClick={()=>{if(applying.current||!actions.length||actions.length>remaining)return;applying.current=true;onApply(actions);onClose();}}>Готово{actions.length>0?` · ${actions.length}`:''}</button>
 </>}>
  <p className="key-actions-intro">Нажимайте клавиши, чтобы собрать последовательность.</p>
  <p className="case-step-hint">Команды не отправляются на телевизор.</p>
  <div className="key-actions-picker">
   <div className="key-actions-remote tv-layout"><div className="remote-top"><span className="connection-led" aria-hidden="true"/></div><button type="button" className="power-button" aria-label={getTvAction('power').label} title={getTvAction('power').label} disabled={full} onClick={()=>add('power')}><IconPower aria-hidden="true"/></button>
    <RemoteLayout buttonProps={action=>({disabled:full,onClick:()=>add(action)})}/>
   </div>
   <section className="key-actions-queue" aria-labelledby="key-actions-queue-title"><h3 id="key-actions-queue-title">Последовательность · {actions.length}</h3>
    {actions.length?<ol ref={queue} aria-label="Добавляемые нажатия">{actions.map((action,index)=><li key={action.id}><span className="key-action-number">{index+1}</span><span>{getTvAction(action.action).label}</span><button type="button" aria-label={`Удалить добавляемое нажатие ${index+1}`} title="Удалить нажатие" onClick={()=>setActions(current=>current.filter(item=>item.id!==action.id))}><IconTrash aria-hidden="true"/></button></li>)}</ol>:<p className="case-step-hint">Выберите клавиши на пульте слева.</p>}
    <p className="case-step-hint">Повторные нажатия добавляются отдельно.</p>
    <p role="status" aria-live="polite" className="case-step-hint">{full?`Не более ${MAX_STEP_KEY_ACTIONS} нажатий на шаг. Удалите запись, чтобы добавить другую.`:''}</p>
   </section>
  </div>
 </SettingsDialog>;
}
