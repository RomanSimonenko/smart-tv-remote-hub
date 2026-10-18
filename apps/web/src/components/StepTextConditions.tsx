import {useId} from 'react';
import {IconPlus,IconTrash} from '@tabler/icons-react';
import {MAX_TEXT_CONDITIONS,MAX_CONDITION_LENGTH} from '@remote-webos-tv/contracts';
export function StepTextConditions({value,onChange,disabled}:{value:string[];onChange(value:string[]):void;disabled:boolean}){
 const id=useId();
 return <section className="step-text-conditions" aria-labelledby={`${id}-title`}>
  <h3 id={`${id}-title`}>Условия</h3>
  <p className="case-step-hint">{value.length?'На экране должны присутствовать все заданные надписи.':'Автоматическая проверка не настроена.'}</p>
  {!!value.length&&<div className="text-condition-list">{value.map((text,index)=>{
   const invalid=[...text.trim()].length<1||[...text.trim()].length>MAX_CONDITION_LENGTH;
   return <div className="text-condition" key={index}>
    <div className="text-condition-row"><label htmlFor={`${id}-${index}`}>Надпись {index+1}<input id={`${id}-${index}`} value={text} disabled={disabled} aria-invalid={invalid} aria-describedby={invalid?`${id}-${index}-error`:undefined} onChange={event=>onChange(value.map((item,i)=>i===index?event.target.value:item))}/></label>
     <button type="button" disabled={disabled} aria-label={`Удалить условие ${index+1}`} title="Удалить условие" onClick={()=>onChange(value.filter((_,i)=>i!==index))}><IconTrash aria-hidden="true"/></button></div>
    {invalid&&<p id={`${id}-${index}-error`} className="field-error">Надпись: от 1 до {MAX_CONDITION_LENGTH} символов.</p>}
   </div>;
  })}</div>}
  <button type="button" disabled={disabled||value.length>=MAX_TEXT_CONDITIONS} onClick={()=>onChange([...value,''])}><IconPlus aria-hidden="true"/>Добавить условие</button>
 </section>;
}
