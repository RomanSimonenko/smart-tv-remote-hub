import {useState} from 'react';
import {createPortal} from 'react-dom';
import {IconArrowUp,IconArrowDown,IconPlus,IconTrash} from '@tabler/icons-react';
import {MAX_STEP_KEY_ACTIONS,MAX_KEY_PAUSE_MS,getTvAction,testCaseKeyActionSchema,type TestCaseKeyAction} from '@remote-webos-tv/contracts';
import {AddKeyActionsDialog} from './AddKeyActionsDialog.js';
interface Props {actions:TestCaseKeyAction[];onChange(actions:TestCaseKeyAction[]):void;disabled:boolean}
export function StepKeySequence({actions,onChange,disabled}:Props){
 const [adding,setAdding]=useState(false);
 function move(index:number,to:number){const next=[...actions];const [item]=next.splice(index,1);next.splice(to,0,item!);onChange(next);}
 return <section className="step-key-sequence" aria-label="Нажатия клавиш">
  <div className="step-key-heading"><h3>Нажатия клавиш</h3><button type="button" disabled={disabled||actions.length>=MAX_STEP_KEY_ACTIONS} onClick={()=>setAdding(true)}><IconPlus aria-hidden="true"/>Добавить нажатия</button></div>
  {!actions.length?<p className="case-step-hint">Нажатия не настроены.</p>:<div className="step-key-table"><div className="step-key-columns" aria-hidden="true"><span>Клавиша</span><span>Пауза после</span></div><ol aria-label="Нажатия шага">{actions.map((action,index)=>{
   const invalid=!testCaseKeyActionSchema.shape.pauseAfterMs.safeParse(action.pauseAfterMs).success;
   return <li key={action.id}><div className="step-key-row"><span className="key-action-number">{index+1}</span><span className="step-key-label">{getTvAction(action.action).label}</span><label className="step-key-pause"><input type="number" min={0} max={MAX_KEY_PAUSE_MS} step={1} disabled={disabled} aria-label={`Пауза после нажатия ${index+1}, мс`} aria-invalid={invalid} value={Number.isNaN(action.pauseAfterMs)?'':action.pauseAfterMs} onChange={event=>onChange(actions.map(item=>item.id===action.id?{...item,pauseAfterMs:event.target.value===''?NaN:Number(event.target.value)}:item))}/><span>мс</span></label><div className="step-key-actions"><button type="button" aria-label={`Поднять нажатие ${index+1}`} title="Поднять нажатие" disabled={disabled||index===0} onClick={()=>move(index,index-1)}><IconArrowUp aria-hidden="true"/></button><button type="button" aria-label={`Опустить нажатие ${index+1}`} title="Опустить нажатие" disabled={disabled||index===actions.length-1} onClick={()=>move(index,index+1)}><IconArrowDown aria-hidden="true"/></button><button type="button" aria-label={`Удалить нажатие ${index+1}`} title="Удалить нажатие" disabled={disabled} onClick={()=>onChange(actions.filter(item=>item.id!==action.id))}><IconTrash aria-hidden="true"/></button></div></div>{invalid&&<p className="field-error">Пауза: целое число от 0 до {MAX_KEY_PAUSE_MS} мс.</p>}</li>;
  })}</ol></div>}
  <p className="case-step-hint">При запуске после каждого нажатия и паузы сохраняется снимок.</p>
  {adding&&createPortal(<AddKeyActionsDialog remaining={MAX_STEP_KEY_ACTIONS-actions.length} onApply={added=>onChange([...actions,...added])} onClose={()=>setAdding(false)}/>,document.body)}
 </section>;
}
