import {IconPower} from '@tabler/icons-react';
import type {TvActionId} from '@remote-webos-tv/contracts';
import {getActionLabel} from '../i18n-actions.js';
import {RemoteLayout} from './RemoteLayout.js';

/** Existing remote presentation; selection callbacks never dispatch TV commands. */
export function KeyActionsRemote({disabled,onSelect}:{disabled:boolean;onSelect(action:TvActionId):void}){
 return <div className="key-actions-remote tv-layout"><div className="remote-top"><span className="connection-led" aria-hidden="true"/></div>
  <button type="button" className="power-button" aria-label={getActionLabel('power')} title={getActionLabel('power')} disabled={disabled} onClick={()=>onSelect('power')}><IconPower aria-hidden="true"/></button>
  <RemoteLayout buttonProps={action=>({disabled,onClick:()=>onSelect(action)})}/>
 </div>;
}
