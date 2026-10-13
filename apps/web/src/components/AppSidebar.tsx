import type { OwnerProfile } from '@remote-webos-tv/contracts';
import { ProfileAvatar } from './ProfileAvatar.js';
import { Brand } from './Brand.js';
import { IconHome, IconDeviceDesktop, IconFileText, IconPlayerPlay, IconSettings, IconChevronsLeft, IconChevronsRight } from '@tabler/icons-react';

interface Props {
  collapsed: boolean; onToggleCollapsed(): void; username: string;
  activeSection: 'televisions' | 'profile' | 'cases'; disabled: boolean; onOpenTelevisions(): void;
  onOpenTestCases?(): void; avatarId?: OwnerProfile['avatarId']; onOpenProfile?(): void;
}
const sections = [
  { id: 'overview', label: 'Обзор', Icon: IconHome },
  { id: 'televisions', label: 'Телевизоры', Icon: IconDeviceDesktop },
  { id: 'cases', label: 'Тест-кейсы', Icon: IconFileText },
  { id: 'runs', label: 'Запуски', Icon: IconPlayerPlay },
  { id: 'settings', label: 'Настройки', Icon: IconSettings },
] as const;
export function AppSidebar({ collapsed, onToggleCollapsed, username, activeSection, disabled, onOpenTelevisions, avatarId = null, onOpenProfile, onOpenTestCases }: Props) {
  const toggleLabel = collapsed ? 'Развернуть меню' : 'Свернуть меню';
  return <aside className="app-sidebar" data-collapsed={collapsed} aria-label="Боковое меню">
    <div className="sidebar-heading">
      <div className="sidebar-brand"><Brand /></div>
    </div>
    <nav id="app-navigation" aria-label="Основная навигация">
      {sections.map(({ id, label, Icon }) => <button key={id} type="button" aria-label={id === 'televisions' || (id === 'cases' && onOpenTestCases) ? label : `${label} — появится позже`} aria-current={id === activeSection ? 'page' : undefined} title={id === 'televisions' || (id === 'cases' && onOpenTestCases) ? label : `${label} — появится позже`} disabled={disabled || (id !== 'televisions' && !(id === 'cases' && onOpenTestCases))} onClick={id === 'televisions' ? onOpenTelevisions : id === 'cases' ? onOpenTestCases : undefined}><Icon aria-hidden="true" /><span>{label}</span></button>)}
    </nav>
      <button type="button" className="sidebar-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={!collapsed} aria-controls="app-navigation" disabled={disabled} onClick={onToggleCollapsed}>{collapsed ? <IconChevronsRight aria-hidden="true" /> : <IconChevronsLeft aria-hidden="true" />}</button>
    <button type="button" className="sidebar-profile" title={username} aria-label={`Мой профиль: ${username}`} aria-current={activeSection === 'profile' ? 'page' : undefined} disabled={disabled || !onOpenProfile} onClick={onOpenProfile}><ProfileAvatar avatarId={avatarId} displayName={username} /><span>{username}</span></button>
  </aside>;
}
