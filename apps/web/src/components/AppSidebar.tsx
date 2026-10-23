import type { OwnerProfile } from '@remote-webos-tv/contracts';
import {useTranslation} from '../i18n.js';
import { ProfileAvatar } from './ProfileAvatar.js';
import { Brand } from './Brand.js';
import { IconHome, IconDeviceDesktop, IconFileText, IconCircle, IconSettings, IconChevronsLeft, IconChevronsRight, type IconProps } from '@tabler/icons-react';
function RunIcon(props:IconProps){return <IconCircle {...props}><path d="M10 8l6 4-6 4z"/></IconCircle>;}

interface Props {
  collapsed: boolean; onToggleCollapsed(): void; username: string;
  activeSection: 'televisions' | 'profile' | 'cases' | 'runs' | 'settings'; disabled: boolean; onOpenTelevisions(): void;
  onOpenSettings?():void;
  onOpenTestCases?(): void; onOpenRuns?():void; avatarId?: OwnerProfile['avatarId']; onOpenProfile?(): void;
}
const sections = [
  { id: 'overview', Icon: IconHome },
  { id: 'televisions', Icon: IconDeviceDesktop },
  { id: 'cases', Icon: IconFileText },
  { id: 'runs', Icon: RunIcon },
  { id: 'settings', Icon: IconSettings },
] as const;
export function AppSidebar({ collapsed, onToggleCollapsed, username, activeSection, disabled, onOpenTelevisions, avatarId = null, onOpenProfile, onOpenTestCases,onOpenRuns,onOpenSettings }: Props) {
  const {t}=useTranslation('common');
  const toggleLabel = t(collapsed ? 'expandMenu' : 'collapseMenu');
  return <aside className="app-sidebar" data-collapsed={collapsed} aria-label={t('sidebar')}>
    <div className="sidebar-heading">
      <div className="sidebar-brand"><Brand /></div>
    </div>
    <nav id="app-navigation" aria-label={t('navigation')}>
      {sections.map(({ id, Icon }) => {const label=t(id);const open=id==='televisions'?onOpenTelevisions:id==='cases'?onOpenTestCases:id==='runs'?onOpenRuns:id==='settings'?onOpenSettings:undefined;return <button key={id} type="button" aria-label={open?label:t('comingSoon',{label})} aria-current={id === activeSection ? 'page' : undefined} title={open?label:t('comingSoon',{label})} disabled={disabled||!open} onClick={open}><Icon aria-hidden="true" /><span>{label}</span></button>;})}
    </nav>
      <button type="button" className="sidebar-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={!collapsed} aria-controls="app-navigation" disabled={disabled} onClick={onToggleCollapsed}>{collapsed ? <IconChevronsRight aria-hidden="true" /> : <IconChevronsLeft aria-hidden="true" />}</button>
    <button type="button" className="sidebar-profile" title={username} aria-label={t('myProfile',{username})} aria-current={activeSection === 'profile' ? 'page' : undefined} disabled={disabled || !onOpenProfile} onClick={onOpenProfile}><ProfileAvatar avatarId={avatarId} displayName={username} /><span>{username}</span></button>
  </aside>;
}
