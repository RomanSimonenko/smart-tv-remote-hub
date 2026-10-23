import {useTranslation} from '../i18n.js';
import {useId} from 'react';
import {IconPlus,IconTrash} from '@tabler/icons-react';
import {MAX_TEXT_CONDITIONS,MAX_CONDITION_LENGTH,textConditionsSchema} from '@remote-webos-tv/contracts';
export function StepTextConditions({value,onChange,disabled}:{value:string[];onChange(value:string[]):void;disabled:boolean}){ const {t}=useTranslation('cases');
 const id=useId();
 return <section className="step-text-conditions" aria-labelledby={`${id}-title`}>
  <div className="step-key-heading"><h3 id={`${id}-title`}>{t('conditions')}</h3>
   <button type="button" disabled={disabled||value.length>=MAX_TEXT_CONDITIONS} onClick={()=>onChange([...value,''])}><IconPlus aria-hidden="true"/>{t('addCondition')}</button>
  </div>
  {!!value.length&&<p className="case-step-hint">{t('allConditions')}</p>}
  {!!value.length&&<div className="text-condition-list">{value.map((text,index)=>{
   const invalid=!textConditionsSchema.element.safeParse(text).success;
   return <div className="text-condition" key={index}>
    <div className="text-condition-row"><label htmlFor={`${id}-${index}`}>{t('conditionNumber',{number:index+1})}<input id={`${id}-${index}`} value={text} disabled={disabled} aria-invalid={invalid} aria-describedby={invalid?`${id}-${index}-error`:undefined} onChange={event=>onChange(value.map((item,i)=>i===index?event.target.value:item))}/></label>
     <button type="button" disabled={disabled} aria-label={t('removeConditionNumber',{number:index+1})} title={t('removeCondition')} onClick={()=>onChange(value.filter((_,i)=>i!==index))}><IconTrash aria-hidden="true"/></button></div>
    {invalid&&<p role="alert" id={`${id}-${index}-error`} className="field-error">{t('conditionValidation',{max:MAX_CONDITION_LENGTH})}</p>}
   </div>;
  })}</div>}
 </section>;
}
