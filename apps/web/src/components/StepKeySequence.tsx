import {getActionLabel} from '../i18n-actions.js';
import {useTranslation} from '../i18n.js';
import {useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {IconGripVertical,IconPlus,IconTrash,IconChevronUp,IconChevronDown} from '@tabler/icons-react';
import {MAX_STEP_KEY_ACTIONS,MAX_KEY_PAUSE_MS,testCaseKeyActionSchema,type TestCaseKeyAction} from '@remote-webos-tv/contracts';
import {AddKeyActionsDialog} from './AddKeyActionsDialog.js';
interface Props {actions:TestCaseKeyAction[];onChange(actions:TestCaseKeyAction[]):void;disabled:boolean}
export function StepKeySequence({actions,onChange,disabled}:Props){ const {t}=useTranslation('cases');
 const [adding,setAdding]=useState(false);
 const dragged=useRef<string|null>(null);const [dropId,setDropId]=useState<string|null>(null);
 function drop(id:string){const from=actions.findIndex(item=>item.id===dragged.current);const to=actions.findIndex(item=>item.id===id);dragged.current=null;setDropId(null);if(!disabled&&from>=0&&to>=0&&from!==to)move(from,to);}
 function move(index:number,to:number){const next=[...actions];const [item]=next.splice(index,1);next.splice(to,0,item!);onChange(next);}
 return <section className="step-key-sequence" aria-label={t('keyPresses')}>
  <div className="step-key-heading"><h3>{t('keyPresses')}</h3><button type="button" disabled={disabled||actions.length>=MAX_STEP_KEY_ACTIONS} onClick={()=>setAdding(true)}><IconPlus aria-hidden="true"/>{t('addPresses')}</button></div>
  {!!actions.length&&<div className="step-key-table"><div className="step-key-columns" aria-hidden="true"><span>{t('key')}</span><span>{t('pauseAfter')}</span></div><ol aria-label={t('stepPresses')}>{actions.map((action,index)=>{
   const invalid=!testCaseKeyActionSchema.shape.pauseAfterMs.safeParse(action.pauseAfterMs).success;
   return <li key={action.id} data-drop-target={dropId===action.id} onDragOver={event=>{if(!disabled&&dragged.current){event.preventDefault();setDropId(action.id);}}} onDrop={event=>{event.preventDefault();drop(action.id);}}><div className="step-key-row"><button type="button" className="step-key-drag" draggable={!disabled} disabled={disabled} aria-label={t('dragPressNumber',{number:index+1})} title={t('dragPress')} onDragStart={event=>{dragged.current=action.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',action.id);}} onDragEnd={()=>{dragged.current=null;setDropId(null);}} onKeyDown={event=>{if(!disabled&&event.altKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')){event.preventDefault();const to=index+(event.key==='ArrowUp'?-1:1);if(to>=0&&to<actions.length)move(index,to);}}}><IconGripVertical aria-hidden="true"/></button><span className="key-action-number">{index+1}</span><span className="step-key-label">{getActionLabel(action.action)}</span><PauseField index={index} value={action.pauseAfterMs} disabled={disabled} invalid={invalid} onChange={pauseAfterMs=>onChange(actions.map(item=>item.id===action.id?{...item,pauseAfterMs}:item))}/><div className="step-key-actions"><button type="button" aria-label={t('removePressNumber',{number:index+1})} title={t('removePress')} disabled={disabled} onClick={()=>onChange(actions.filter(item=>item.id!==action.id))}><IconTrash aria-hidden="true"/></button></div></div>{invalid&&<p className="field-error">{t('pauseValidation',{max:MAX_KEY_PAUSE_MS})}</p>}</li>;
  })}</ol></div>}
  {adding&&createPortal(<AddKeyActionsDialog remaining={MAX_STEP_KEY_ACTIONS-actions.length} onApply={added=>onChange([...actions,...added])} onClose={()=>setAdding(false)}/>,document.body)}
 </section>;
}

interface PauseProps {index:number;value:number;disabled:boolean;invalid:boolean;onChange(value:number):void}
function PauseField({index,value,disabled,invalid,onChange}:PauseProps){
 const {t}=useTranslation('cases');
 const input=useRef<HTMLInputElement>(null);
 function step(direction:1|-1){const field=input.current;if(!field)return;if(direction===1)field.stepUp();else field.stepDown();onChange(field.valueAsNumber);}
 return <div className="step-key-pause"><span className="step-key-number"><input ref={input} type="number" min={0} max={MAX_KEY_PAUSE_MS} step={100} disabled={disabled} aria-label={t('pauseLabel',{number:index+1})} aria-invalid={invalid} value={Number.isNaN(value)?'':value} onChange={event=>onChange(event.target.value===''?NaN:Number(event.target.value))}/><span className="step-key-spinner"><button type="button" aria-label={t('increasePauseLabel',{number:index+1})} title={t('increasePause')} disabled={disabled||value>=MAX_KEY_PAUSE_MS} onClick={()=>step(1)}><IconChevronUp aria-hidden="true"/></button><button type="button" aria-label={t('decreasePauseLabel',{number:index+1})} title={t('decreasePause')} disabled={disabled||value<=0} onClick={()=>step(-1)}><IconChevronDown aria-hidden="true"/></button></span></span><span>{t('milliseconds')}</span></div>;
}
