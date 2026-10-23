import {getActionLabel} from '../i18n-actions.js';
import {useTranslation} from '../i18n.js';
import {useRef,useState,type ReactNode} from 'react';
import {IconGripVertical,IconPlus,IconTrash,IconChevronUp,IconChevronDown} from '@tabler/icons-react';
import {MAX_STEP_KEY_ACTIONS,DEFAULT_KEY_PAUSE_MS,MAX_KEY_PAUSE_MS,MIN_KEY_HOLD_MS,MAX_KEY_HOLD_MS,DEFAULT_KEY_HOLD_MS,canHoldTvAction,keyHoldDurationSchema,testCaseKeyActionSchema,type TestCaseKeyAction,type TvActionId} from '@remote-webos-tv/contracts';
import {KeyActionsRemote} from './KeyActionsRemote.js';
interface Props {actions:TestCaseKeyAction[];onChange(actions:TestCaseKeyAction[]):void;disabled:boolean;children?:ReactNode}
export function StepKeySequence({actions,onChange,disabled,children}:Props){ const {t}=useTranslation('cases');
 const [adding,setAdding]=useState(true);
 const dragged=useRef<string|null>(null);const [dropId,setDropId]=useState<string|null>(null);
 function drop(id:string){const from=actions.findIndex(item=>item.id===dragged.current);const to=actions.findIndex(item=>item.id===id);dragged.current=null;setDropId(null);if(!disabled&&from>=0&&to>=0&&from!==to)move(from,to);}
 function move(index:number,to:number){const next=[...actions];const [item]=next.splice(index,1);next.splice(to,0,item!);onChange(next);}
 function add(action:TvActionId){if(disabled||actions.length>=MAX_STEP_KEY_ACTIONS)return;onChange([...actions,{id:crypto.randomUUID(),action,pauseAfterMs:DEFAULT_KEY_PAUSE_MS}]);}
 return <div className="step-key-workspace" data-remote-open={adding}>
  {adding&&<section className="step-inline-remote" aria-label={t('addPresses')}><h3>{t('addPresses')}</h3><KeyActionsRemote disabled={disabled||actions.length>=MAX_STEP_KEY_ACTIONS} onSelect={add}/></section>}
  <div className="step-key-detail"><section className="step-key-sequence" aria-label={t('keyPresses')}>
  <div className="step-key-heading"><h3>{t('keyPresses')} · {actions.length}</h3><button type="button" disabled={disabled} aria-expanded={adding} onClick={()=>setAdding(!adding)}>{adding?<IconChevronUp aria-hidden="true"/>:<IconPlus aria-hidden="true"/>}{t(adding?'hideRemote':'addPresses')}</button></div>
  <p className="case-step-hint">{t('appendFromRemote')} {t('noCommands')}</p>
  {!!actions.length&&<div className="step-key-table"><div className="step-key-columns" aria-hidden="true"><span>{t('key')}</span><span>{t('pauseAfter')}</span><span>{t('holdColumn')}</span></div><ol aria-label={t('stepPresses')}>{actions.map((action,index)=>{
   const invalid=!testCaseKeyActionSchema.shape.pauseAfterMs.safeParse(action.pauseAfterMs).success;
   return <li key={action.id} data-drop-target={dropId===action.id} onDragOver={event=>{if(!disabled&&dragged.current){event.preventDefault();setDropId(action.id);}}} onDrop={event=>{event.preventDefault();drop(action.id);}}><div className="step-key-row"><button type="button" className="step-key-drag" draggable={!disabled} disabled={disabled} aria-label={t('dragPressNumber',{number:index+1})} title={t('dragPress')} onDragStart={event=>{dragged.current=action.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',action.id);}} onDragEnd={()=>{dragged.current=null;setDropId(null);}} onKeyDown={event=>{if(!disabled&&event.altKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')){event.preventDefault();const to=index+(event.key==='ArrowUp'?-1:1);if(to>=0&&to<actions.length)move(index,to);}}}><IconGripVertical aria-hidden="true"/></button><span className="key-action-number">{index+1}</span><span className="step-key-label">{getActionLabel(action.action)}</span><DurationField index={index} value={action.pauseAfterMs} disabled={disabled} invalid={invalid} onChange={pauseAfterMs=>onChange(actions.map(item=>item.id===action.id?{...item,pauseAfterMs}:item))}/><KeyHoldField action={action} index={index} disabled={disabled} onChange={next=>onChange(actions.map(item=>item.id===next.id?next:item))}/><div className="step-key-actions"><button type="button" aria-label={t('removePressNumber',{number:index+1})} title={t('removePress')} disabled={disabled} onClick={()=>onChange(actions.filter(item=>item.id!==action.id))}><IconTrash aria-hidden="true"/></button></div></div>{invalid&&<p className="field-error">{t('pauseValidation',{max:MAX_KEY_PAUSE_MS})}</p>}</li>;
  })}</ol></div>}
  {!actions.length&&<p className="case-step-hint">{t('chooseKeys')}</p>}
  <p className="case-step-hint" role="status">{actions.length>=MAX_STEP_KEY_ACTIONS?t('pressLimit',{max:MAX_STEP_KEY_ACTIONS}):t('repeatedPresses')}</p>
 </section>{children}</div></div>;
}

function KeyHoldField({action,index,disabled,onChange}:{action:TestCaseKeyAction;index:number;disabled:boolean;onChange(action:TestCaseKeyAction):void}){
 const {t}=useTranslation('cases');
 if(!canHoldTvAction(action.action))return null;
 const holding=action.holdForMs!==undefined;
 const invalid=holding&&!keyHoldDurationSchema.safeParse(action.holdForMs).success;
 return <><div className="step-key-hold"><label><input type="checkbox" disabled={disabled} checked={holding} aria-label={t('holdLabel',{number:index+1})} onChange={event=>{const {holdForMs:_,...press}=action;onChange(event.target.checked?{...press,holdForMs:DEFAULT_KEY_HOLD_MS}:press);}}/>{t('hold')}</label>{holding&&<DurationField kind="hold" index={index} value={action.holdForMs!} disabled={disabled} invalid={invalid} describedBy={invalid?`hold-error-${action.id}`:undefined} onChange={holdForMs=>onChange({...action,holdForMs})}/>}</div>{invalid&&<p className="field-error" id={`hold-error-${action.id}`}>{t('holdValidation',{min:MIN_KEY_HOLD_MS,max:MAX_KEY_HOLD_MS})}</p>}</>;
}

interface DurationProps {kind?:'pause'|'hold';index:number;value:number;disabled:boolean;invalid:boolean;describedBy?:string|undefined;onChange(value:number):void}
function DurationField({kind='pause',index,value,disabled,invalid,describedBy,onChange}:DurationProps){
 const {t}=useTranslation('cases');
 const input=useRef<HTMLInputElement>(null);
 const holding=kind==='hold',min=holding?MIN_KEY_HOLD_MS:0,max=holding?MAX_KEY_HOLD_MS:MAX_KEY_PAUSE_MS;
 function step(direction:1|-1){const field=input.current;if(!field)return;if(direction===1)field.stepUp();else field.stepDown();onChange(field.valueAsNumber);}
 return <div className={holding?'step-key-hold-duration':'step-key-pause'}><span className="step-key-number"><input ref={input} type="number" min={min} max={max} step={100} disabled={disabled} aria-label={t(holding?'holdDurationLabel':'pauseLabel',{number:index+1})} aria-invalid={invalid} aria-describedby={describedBy} value={Number.isNaN(value)?'':value} onChange={event=>onChange(event.target.value===''?NaN:Number(event.target.value))}/><span className="step-key-spinner"><button type="button" aria-label={t(holding?'increaseHoldLabel':'increasePauseLabel',{number:index+1})} title={t('increasePause')} disabled={disabled||value>=max} onClick={()=>step(1)}><IconChevronUp aria-hidden="true"/></button><button type="button" aria-label={t(holding?'decreaseHoldLabel':'decreasePauseLabel',{number:index+1})} title={t('decreasePause')} disabled={disabled||value<=min} onClick={()=>step(-1)}><IconChevronDown aria-hidden="true"/></button></span></span><span>{t('milliseconds')}</span></div>;
}
