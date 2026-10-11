// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useState } from 'react';
import { AppSidebar } from './AppSidebar.js';
afterEach(cleanup);
function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  return <AppSidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed(!collapsed)} username="synthetic-owner" activeSection="televisions" disabled={false} onOpenTelevisions={vi.fn()} />;
}
test('has five ordered sections, one current and unavailable future screens', () => {
  render(<Sidebar />);
  const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
  expect(within(nav).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Обзор — появится позже', 'Телевизоры', 'Тест-кейсы — появится позже', 'Запуски — появится позже', 'Настройки — появится позже']);
  expect(within(nav).getAllByRole('button').filter(b => b.getAttribute('aria-current') === 'page')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Тест-кейсы — появится позже' }).hasAttribute('disabled')).toBe(true);
});
test('collapse button stays available and reverses its action', () => {
  render(<Sidebar />);
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть меню' }));
  expect(screen.getByRole('button', { name: 'Телевизоры' }).title).toBe('Телевизоры');
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть меню' }));
  expect(screen.getByRole('button', { name: 'Свернуть меню' })).toBeTruthy();
});
test('interaction lock blocks navigation and collapse', () => {
  const open = vi.fn(), toggle = vi.fn();
  render(<AppSidebar collapsed={false} onToggleCollapsed={toggle} username="synthetic-owner" activeSection="televisions" disabled onOpenTelevisions={open} />);
  fireEvent.click(screen.getByRole('button', { name: 'Телевизоры' }));
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть меню' }));
  expect(open).not.toHaveBeenCalled(); expect(toggle).not.toHaveBeenCalled();
});
test('profile opens from both menu states and has current state', () => {
  const openProfile = vi.fn();
  const { rerender } = render(<AppSidebar collapsed={false} onToggleCollapsed={vi.fn()} username="QA Team" avatarId="robot" activeSection="profile" disabled={false} onOpenTelevisions={vi.fn()} onOpenProfile={openProfile} />);
  fireEvent.click(screen.getByRole('button', { name: 'Мой профиль: QA Team' }));
  expect(openProfile).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Мой профиль: QA Team' }).getAttribute('aria-current')).toBe('page');
  rerender(<AppSidebar collapsed onToggleCollapsed={vi.fn()} username="QA Team" avatarId="robot" activeSection="profile" disabled onOpenTelevisions={vi.fn()} onOpenProfile={openProfile} />);
  fireEvent.click(screen.getByRole('button', { name: 'Мой профиль: QA Team' }));
  expect(openProfile).toHaveBeenCalledTimes(1);
});
