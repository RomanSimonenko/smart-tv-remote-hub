import {getActionLabel} from '../i18n-actions.js';
import {useTranslation,formatLocale} from '../i18n.js';
import {useState} from 'react';
import {type TestRun,type TestRunItem} from '@remote-webos-tv/contracts';
import {IconCheck,IconCircle,IconCircleCheck,IconCircleX,IconAlertTriangle,IconLoader2,IconChevronDown} from '@tabler/icons-react';
import {SavedSnapshot,snapshotUrl} from './run-presentation.js';
import {stepState} from './run-step-state.js';

type Step=TestRun['testCase']['steps'][number];
const states={
 passed:{label:'conditionsPassed',Icon:IconCircleCheck},
 failed:{label:'conditionsFailed',Icon:IconCircleX},
 completed:{label:'completed',Icon:IconCheck},
 needs_review:{label:'verificationIncomplete',Icon:IconAlertTriangle},
 running:{label:'running',Icon:IconLoader2},
 interrupted:{label:'interrupted',Icon:IconAlertTriangle},
 not_run:{label:'notRun',Icon:IconCircle},
};

export function RunStepEvidence({runId,step,index,items,status,selectedId,onSelect}:{runId:string;step:Step;index:number;items:TestRunItem[];status:TestRun['status'];selectedId:string|undefined;onSelect(id:string):void}){
 const {t}=useTranslation('runs');
 const [open,setOpen]=useState<boolean>();
 const [visibleCount,setVisibleCount]=useState(100);
 const expanded=open??items.some(item=>item.id===selectedId);
 const state=stepState(step,items,status),{label,Icon}=states[state];
 const saved=items.filter(item=>item.phase==='saved').length;
 return <li><details open={expanded} className="report-step">
  <summary data-status={state} onClick={event=>{event.preventDefault();setOpen(!expanded);}}>
   <Icon className={`report-step-status${state==='running'?' run-spinner':''}`} aria-hidden="true"/>
   <span><strong>{index+1}. {t(step.kind)} · {step.text}</strong><small className="report-step-result">{t(label)}</small><small>{t('snapshotsProgress',{count:saved,total:step.actions?.length||1})}</small></span>
   <IconChevronDown className="report-step-chevron" aria-hidden="true"/>
  </summary>
  {expanded&&<div className="report-step-content">
   {!items.length?<p className="report-explanation">{t('noEvidence')}</p>:<ol className="run-evidence-list">{items.slice(0,visibleCount).map(value=><li key={value.id}>
    <button type="button" data-verification={value.verification?.status} disabled={value.phase!=='saved'} aria-pressed={value.id===selectedId} onClick={()=>onSelect(value.id)}>
     {value.phase==='saved'&&<img src={snapshotUrl(runId,value.id)} alt="" loading="lazy"/>}
     <span><strong>{value.phase==='saved'?t('snapshot'):t('evidence')} {value.ordinal}</strong>
      {value.action&&<small>{t('actionPause',{action:getActionLabel(value.action.action),pause:value.action.pauseAfterMs})}</small>}
      {value.phase==='saved'?<><SavedSnapshot/><small>{t('captured')}{new Intl.DateTimeFormat(formatLocale(),{timeStyle:'medium'}).format(value.capturedAt!)}</small></>:<small>{value.delivery?.outcome==='sent'?t('deliveredNoSnapshot'):value.delivery?.outcome==='unknown'||value.phase==='sending'?t('deliveryUnknown'):value.delivery?.outcome==='rejected'?t('commandRejected'):t('notRun')}</small>}
     </span>
    </button>
   </li>)}</ol>}
   {items.length>visibleCount&&<button type="button" onClick={()=>setVisibleCount(value=>value+100)}>{t('moreEvidence')}</button>}
  </div>}
 </details></li>;
}
