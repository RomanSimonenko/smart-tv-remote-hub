import type { OwnerProfile } from '@remote-webos-tv/contracts';
import { ProfileAvatar } from './ProfileAvatar.js';
import { IconHome, IconDeviceDesktop, IconFileText, IconPlayerPlay, IconSettings, IconChevronsLeft, IconChevronsRight } from '@tabler/icons-react';

interface Props {
  collapsed: boolean; onToggleCollapsed(): void; username: string;
  activeSection: 'televisions' | 'profile'; disabled: boolean; onOpenTelevisions(): void;
  avatarId?: OwnerProfile['avatarId']; onOpenProfile?(): void;
}
const sections = [
  { id: 'overview', label: 'Обзор', Icon: IconHome },
  { id: 'televisions', label: 'Телевизоры', Icon: IconDeviceDesktop },
  { id: 'cases', label: 'Тест-кейсы', Icon: IconFileText },
  { id: 'runs', label: 'Запуски', Icon: IconPlayerPlay },
  { id: 'settings', label: 'Настройки', Icon: IconSettings },
] as const;
export function AppSidebar({ collapsed, onToggleCollapsed, username, activeSection, disabled, onOpenTelevisions, avatarId = null, onOpenProfile }: Props) {
  const toggleLabel = collapsed ? 'Развернуть меню' : 'Свернуть меню';
  return <aside className="app-sidebar" data-collapsed={collapsed} aria-label="Боковое меню">
    <div className="sidebar-heading">
      <div className="sidebar-brand" title="Smart TV Remote Hub"><IconDeviceDesktop aria-hidden="true" /><span>Smart TV<br />Remote Hub</span></div>
      <button type="button" className="sidebar-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={!collapsed} aria-controls="app-navigation" disabled={disabled} onClick={onToggleCollapsed}>{collapsed ? <IconChevronsRight aria-hidden="true" /> : <IconChevronsLeft aria-hidden="true" />}</button>
    </div>
    <nav id="app-navigation" aria-label="Основная навигация">
      {sections.map(({ id, label, Icon }) => <button key={id} type="button" aria-label={id === 'televisions' ? label : `${label} — появится позже`} aria-current={id === activeSection ? 'page' : undefined} title={id === 'televisions' ? label : `${label} — появится позже`} disabled={disabled || id !== 'televisions'} onClick={id === 'televisions' ? onOpenTelevisions : undefined}><Icon aria-hidden="true" /><span>{label}</span></button>)}
    </nav>
    <button type="button" className="sidebar-profile" title={username} aria-label={`Мой профиль: ${username}`} aria-current={activeSection === 'profile' ? 'page' : undefined} disabled={disabled || !onOpenProfile} onClick={onOpenProfile}><ProfileAvatar avatarId={avatarId} displayName={username} /><span>{username}</span></button>
  </aside>;
}
