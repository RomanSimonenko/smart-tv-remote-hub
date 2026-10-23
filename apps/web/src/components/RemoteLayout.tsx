import { i18n, useTranslation } from '../i18n.js';
import type { ComponentPropsWithoutRef } from 'react';
import { IconChevronUp, IconChevronDown, IconChevronLeft, IconChevronRight, IconHome, IconArrowBackUp, IconMinus, IconPlus, IconVolumeOff, type Icon } from '@tabler/icons-react';
import { tvActionCatalog, type BasicTvButton, type TvActionId, type TvActionGroup } from '@remote-webos-tv/contracts';
import { getActionLabel } from '../i18n-actions.js';

type ButtonProps = ComponentPropsWithoutRef<'button'>;
interface Props {
 buttonProps(action: TvActionId): ButtonProps;
 groupProps?: ComponentPropsWithoutRef<'div'>;
}
const entries = (group: TvActionGroup) => tvActionCatalog.filter(action => action.group === group);
const icons: Partial<Record<BasicTvButton, Icon>> = {
 UP: IconChevronUp, DOWN: IconChevronDown, LEFT: IconChevronLeft, RIGHT: IconChevronRight,
 HOME: IconHome, BACK: IconArrowBackUp, VOLUME_DOWN: IconMinus, VOLUME_UP: IconPlus, MUTE: IconVolumeOff,
 CHANNEL_DOWN: IconMinus, CHANNEL_UP: IconPlus,
};
/** Shared presentation only. Network and hold lifecycles belong to Remote. */
export function RemoteLayout({buttonProps,groupProps}: Props) {
  useTranslation('devices');
 const controls = (group: TvActionGroup) => entries(group).map(({id}) => {
  const button=id as BasicTvButton, ButtonIcon=icons[button];
  const props=buttonProps(id);
  return <button type="button" key={id} data-command={id} aria-label={getActionLabel(id)} title={getActionLabel(id)}
   className={id==='ENTER'?'ok-button':undefined} {...props} style={{gridArea:id,...props.style}}>
   {(id==='CHANNEL_DOWN'||id==='CHANNEL_UP')&&<span>CH</span>}
   {ButtonIcon&&<ButtonIcon aria-hidden="true"/>}{id==='ENTER'&&'OK'}
  </button>;
 });
 return <div role="group" aria-label={i18n.t('remote', { ns: 'devices' })} tabIndex={0} {...groupProps} className={['remote',groupProps?.className].filter(Boolean).join(' ')}>
  <h2 className="visually-hidden">{i18n.t('remote', { ns: 'devices' })}</h2>
  <div role="group" aria-label={i18n.t('numbers', { ns: 'devices' })} className="remote-buttons numeric-pad">{entries('numeric').map(({id})=><button type="button" key={id} aria-label={getActionLabel(id)} title={getActionLabel(id)} {...buttonProps(id)}>{id}</button>)}</div>
  <div role="group" aria-label={i18n.t('navigation', { ns: 'devices' })} className="remote-buttons d-pad">{controls('navigation')}</div>
  <div role="group" aria-label={i18n.t('volume', { ns: 'devices' })} className="remote-buttons volume">{controls('volume')}</div>
  <div role="group" aria-label={i18n.t('channels', { ns: 'devices' })} className="remote-buttons channels">{controls('channel')}</div>
  <div role="group" aria-label={i18n.t('colors', { ns: 'devices' })} className="remote-buttons color-buttons">{entries('color').map(({id})=><button type="button" key={id} aria-label={getActionLabel(id)} title={getActionLabel(id)} data-color={id} {...buttonProps(id)}><span aria-hidden="true" className="color-mark"/></button>)}</div>
  <button type="button" className="wink-button" data-app="wink" aria-label={getActionLabel('wink')} title={getActionLabel('wink')} {...buttonProps('wink')}><img src="/wink-logo.svg" alt="" aria-hidden="true" width="100" height="27"/></button>
 </div>;
}
