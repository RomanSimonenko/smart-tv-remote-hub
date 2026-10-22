import {useState} from 'react';
import {getTvAction,type TestRun,type TestRunItem} from '@remote-webos-tv/contracts';
import {IconCheck,IconCircle,IconCircleCheck,IconCircleX,IconAlertTriangle,IconLoader2,IconChevronDown} from '@tabler/icons-react';
import {SavedSnapshot,snapshotUrl,stepLabels} from './run-presentation.js';
import {stepState} from './run-step-state.js';

type Step=TestRun['testCase']['steps'][number];
const states={
 passed:{label:'Условия выполнены',Icon:IconCircleCheck},
 failed:{label:'Условия не выполнены',Icon:IconCircleX},
 completed:{label:'Выполнен без автоматической проверки',Icon:IconCheck},
 needs_review:{label:'Проверка не завершена',Icon:IconAlertTriangle},
 running:{label:'Выполняется',Icon:IconLoader2},
 interrupted:{label:'Выполнение прервано',Icon:IconAlertTriangle},
 not_run:{label:'Не выполнялся',Icon:IconCircle},
};

export function RunStepEvidence({runId,step,index,items,status,selectedId,onSelect}:{runId:string;step:Step;index:number;items:TestRunItem[];status:TestRun['status'];selectedId:string|undefined;onSelect(id:string):void}){
 const [open,setOpen]=useState<boolean>();
 const [visibleCount,setVisibleCount]=useState(100);
 const expanded=open??items.some(item=>item.id===selectedId);
 const state=stepState(step,items,status),{label,Icon}=states[state];
 const saved=items.filter(item=>item.phase==='saved').length;
 return <li><details open={expanded} className="report-step">
  <summary data-status={state} onClick={event=>{event.preventDefault();setOpen(!expanded);}}>
   <Icon className={`report-step-status${state==='running'?' run-spinner':''}`} aria-hidden="true"/>
   <span><strong>{index+1}. {stepLabels[step.kind]} · {step.text}</strong><small className="report-step-result">{label}</small><small>Снимков: {saved} из {step.actions?.length||1}</small></span>
   <IconChevronDown className="report-step-chevron" aria-hidden="true"/>
  </summary>
  {expanded&&<div className="report-step-content">
   {!items.length?<p className="report-explanation">Свидетельства отсутствуют.</p>:<ol className="run-evidence-list">{items.slice(0,visibleCount).map(value=><li key={value.id}>
    <button type="button" data-verification={value.verification?.status} disabled={value.phase!=='saved'} aria-pressed={value.id===selectedId} onClick={()=>onSelect(value.id)}>
     {value.phase==='saved'&&<img src={snapshotUrl(runId,value.id)} alt="" loading="lazy"/>}
     <span><strong>{value.phase==='saved'?'Снимок':'Свидетельство'} {value.ordinal}</strong>
      {value.action&&<small>{getTvAction(value.action.action).label} · пауза {value.action.pauseAfterMs} мс</small>}
      {value.phase==='saved'?<><SavedSnapshot/><small>Захват: {new Intl.DateTimeFormat('ru-RU',{timeStyle:'medium'}).format(value.capturedAt!)}</small></>:<small>{value.delivery?.outcome==='sent'?'Команда доставлена, снимок не сохранён':value.delivery?.outcome==='unknown'||value.phase==='sending'?'Доставка неизвестна':value.delivery?.outcome==='rejected'?'Команда отклонена':'Не выполнялся'}</small>}
     </span>
    </button>
   </li>)}</ol>}
   {items.length>visibleCount&&<button type="button" onClick={()=>setVisibleCount(value=>value+100)}>Показать ещё свидетельства</button>}
  </div>}
 </details></li>;
}
