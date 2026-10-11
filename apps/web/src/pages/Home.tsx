import { PasswordChangeDialog } from '../components/PasswordChangeDialog.js';
import { IconKey, IconChevronRight } from '@tabler/icons-react';
import type { PasswordChangeRequest, PasswordChangeResponse } from '@remote-webos-tv/contracts';
import { Profile } from './Profile.js';
import { useOwnerProfile } from '../useOwnerProfile.js';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TvSetup } from './TvSetup.js';
import { IconArrowLeft, IconInfoCircle, IconSettings } from '@tabler/icons-react';
import { LogoutConfirmation } from '../components/LogoutConfirmation.js';
import { SettingsDialog } from '../components/SettingsDialog.js';
import { useTvStatus } from '../useTvStatus.js';
import { Dashboard } from './Dashboard.js';
import { useTvDevices } from '../useTvDevices.js';
import type { TvId, TvPlatform } from '@remote-webos-tv/contracts';
import { AddTv } from './AddTv.js';
import { AppSidebar } from '../components/AppSidebar.js';
import { useUiPreferences } from '../useUiPreferences.js';
import { api, ApiFailure } from '../api.js';

interface Props { onPasswordChange?(input: PasswordChangeRequest): Promise<PasswordChangeResponse>; username: string; csrfToken: string; tvActive: boolean; busy: boolean; error: ReactNode; onLogout(): void; onSessionExpired(): void }
export function Home({ username, csrfToken, tvActive, busy, error, onLogout, onSessionExpired, onPasswordChange }: Props) {
  const props = { ...(onPasswordChange ? { onPasswordChange } : {}), username, csrfToken, tvActive, busy, error, onLogout, onSessionExpired };
  return <HomeContent {...props} />;
}
function HomeContent({ username, csrfToken, tvActive, busy, error, onLogout, onSessionExpired, onPasswordChange }: Props) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState('');
  const preferences = useUiPreferences();
  const owner = useOwnerProfile(csrfToken, onSessionExpired, tvActive);
  const [profileVersion, setProfileVersion] = useState(0);
  const [profileDirty, setProfileDirty] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  function requestLeave(action: () => void) {
    if (owner.saving) return;
    if (profileDirty) setPendingLeave(() => action); else action();
  }
  useEffect(() => {
    if (!profileDirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [profileDirty]);
  const [screen, setScreen] = useState<'dashboard' | 'add' | 'remote' | 'profile'>('dashboard');
  const [tvId, setTvId] = useState<TvId | null>(null);
  const [platform, setPlatform] = useState<TvPlatform>('webos');
  const devicesState = useTvDevices(onSessionExpired, tvActive && screen === 'dashboard');
  const statusState = useTvStatus(onSessionExpired, tvId ?? undefined, tvActive && screen === 'remote' && tvId !== null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [confirmingPower, setConfirmingPower] = useState(false);
  const [identityTarget, setIdentityTarget] = useState<HTMLDivElement | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const logoutButton = useRef<HTMLButtonElement>(null);
  const help = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismissHelp(event: PointerEvent) {
      if (event.target instanceof Node && !help.current?.contains(event.target) && help.current) help.current.open = false;
    }
    document.addEventListener('pointerdown', dismissHelp);
    return () => document.removeEventListener('pointerdown', dismissHelp);
  }, []);
  useEffect(() => { if ((settingsOpen || confirmingPower || confirmingLogout) && help.current) help.current.open = false; }, [settingsOpen, confirmingPower, confirmingLogout]);
  useEffect(() => { if (!tvActive) { setSettingsOpen(false); setConfirmingPower(false); } }, [tvActive]);
  function navigate(next: typeof screen) {
    setProfileDirty(false); setSettingsOpen(false); setConfirmingPower(false); setScreen(next);
    if (help.current) help.current.open = false;
  }
  return <div className="app-workspace" data-collapsed={preferences.collapsed}>
    <AppSidebar collapsed={preferences.collapsed} onToggleCollapsed={() => preferences.setCollapsed(!preferences.collapsed)} username={owner.profile?.displayName ?? username} avatarId={owner.profile?.avatarId ?? null} activeSection={screen === 'profile' ? 'profile' : 'televisions'} disabled={passwordOpen || !tvActive || busy || settingsOpen || confirmingPower || confirmingLogout || !!pendingLeave || owner.saving} onOpenTelevisions={() => { if (screen !== 'dashboard') requestLeave(() => navigate('dashboard')); }} onOpenProfile={() => { if (screen !== 'profile') requestLeave(() => navigate('profile')); }} />
    <section className="app-content">
    {preferences.persistenceError && <p className="preferences-warning" role="status">{preferences.persistenceError}</p>}
    <header className="app-header" hidden={screen === 'profile'}>
      <div className="header-identity"><div ref={setIdentityTarget} /></div>
      <div className="header-actions">
        {screen === 'remote' && <details ref={help} className="keyboard-help"><summary aria-label="Управление с клавиатуры" title="Управление с клавиатуры"><IconInfoCircle aria-hidden="true" /></summary><div id="remote-help" className="help-panel">
          <p>Нажмите Tab, чтобы перейти к пульту, или нажмите на свободное место внутри него.</p>
          <dl className="keyboard-shortcuts">
            <div><dt><kbd>↑ ↓ ← →</kbd></dt><dd>Навигация</dd></div>
            <div><dt><kbd>Enter</kbd></dt><dd>OK</dd></div>
            <div><dt><kbd>Escape</kbd></dt><dd>Назад</dd></div>
            <div><dt><kbd>Home</kbd></dt><dd>Домой</dd></div>
            <div><dt><kbd>+</kbd></dt><dd>Громче</dd></div>
            <div><dt><kbd>−</kbd></dt><dd>Тише</dd></div>
            <div><dt><kbd>M</kbd></dt><dd>Без звука</dd></div>
          </dl>
        </div></details>}
        <button ref={settingsButton} type="button" aria-label={screen === 'remote' ? 'Настройки ТВ' : 'Аккаунт'} title={screen === 'remote' ? 'Настройки ТВ' : 'Аккаунт'} aria-haspopup="dialog" disabled={!tvActive || confirmingPower || !!pendingLeave || owner.saving} onClick={() => { settingsButton.current?.focus(); setSettingsOpen(true); }}><IconSettings aria-hidden="true" /><span>{screen === 'remote' ? 'Настройки ТВ' : 'Аккаунт'}</span></button>
        <button ref={screen === 'profile' ? undefined : logoutButton} type="button" aria-haspopup="dialog" disabled={busy || confirmingPower || !!pendingLeave || owner.saving} onClick={() => requestLeave(() => { setSettingsOpen(false); setConfirmingLogout(true); })}>{busy ? 'Выход…' : 'Выйти'}</button>
      </div>
    </header>
    <LogoutConfirmation open={confirmingLogout && !busy} anchor={logoutButton} onClose={() => setConfirmingLogout(false)} onConfirm={() => { setConfirmingLogout(false); onLogout(); }} />
    <SettingsDialog title="Несохранённые изменения" closeLabel="Остаться в профиле" open={!!pendingLeave} onClose={() => setPendingLeave(null)}><p>Изменения профиля не сохранены. Покинуть страницу?</p><div className="profile-leave-actions"><button type="button" onClick={() => setPendingLeave(null)}>Остаться</button><button type="button" onClick={() => { const leave = pendingLeave; setPendingLeave(null); setProfileDirty(false); setProfileVersion(value => value + 1); leave?.(); }}>Не сохранять и продолжить</button></div></SettingsDialog>
    {tvActive && (screen === 'profile' ? <>{owner.loading && !owner.profile ? <p role="status">Загрузка профиля…</p> : owner.profile ? <Profile securityAction={<><div className="profile-security-row"><IconKey aria-hidden="true" /><div><h3>Пароль</h3><p>Измените пароль для защиты вашего аккаунта.</p></div><button type="button" disabled={owner.saving || !onPasswordChange} onClick={() => requestLeave(() => { setPasswordNotice(''); setPasswordOpen(true); })}>Изменить пароль<IconChevronRight aria-hidden="true" /></button></div>{passwordNotice && <p role="status">{passwordNotice}</p>}</>} sessionAction={<button ref={logoutButton} type="button" aria-haspopup="dialog" disabled={busy || !!pendingLeave || owner.saving} onClick={() => requestLeave(() => { setSettingsOpen(false); setConfirmingLogout(true); })}>{busy ? 'Выход…' : 'Выйти'}</button>} key={profileVersion} profile={owner.profile} saving={owner.saving} error={owner.error} onSave={owner.save} onDirtyChange={setProfileDirty} /> : <div><p role="alert">{owner.error}</p><button type="button" onClick={owner.refresh}>Повторить загрузку профиля</button></div>}</> : screen === 'dashboard' ? <>
      <Dashboard devices={devicesState.devices} loading={devicesState.loading} error={devicesState.error} onRetry={devicesState.refresh} onOpenTv={(id) => { setTvId(id); setPlatform(devicesState.devices!.find(device => device.tvId === id)!.platform); navigate('remote'); }} onAddTv={() => navigate('add')} onDeleteTv={async (id, signal) => {
        try { await api.deleteTv(id, csrfToken, signal); devicesState.remove(id); }
        catch (cause) { devicesState.refresh(); if (cause instanceof ApiFailure && cause.status === 401) onSessionExpired(); throw cause; }
      }} />
    </> : <>
      <nav className="tv-navigation" aria-label="Телевизоры"><button type="button" disabled={confirmingPower} onClick={() => navigate('dashboard')}><IconArrowLeft aria-hidden="true" />К списку телевизоров</button></nav>
      {screen === 'add' ? <AddTv csrfToken={csrfToken} onSessionExpired={onSessionExpired} onReady={() => navigate('dashboard')} /> : tvId && <TvSetup key={tvId} tvId={tvId} platform={platform} username={username} csrfToken={csrfToken} identityTarget={identityTarget} statusState={statusState} settingsOpen={settingsOpen} onCloseSettings={() => setSettingsOpen(false)} onConfirmationChange={setConfirmingPower} onSessionExpired={onSessionExpired} />}
    </>)}
    {tvActive && screen !== 'remote' && <SettingsDialog title="Настройки аккаунта" open={settingsOpen} onClose={() => setSettingsOpen(false)}><p className="session-caption">Вы вошли как {username}.</p></SettingsDialog>}
    {passwordOpen && onPasswordChange && <PasswordChangeDialog onClose={() => setPasswordOpen(false)} onSave={onPasswordChange} onSuccess={warning => { setPasswordOpen(false); setPasswordNotice(warning ? 'Пароль изменён. Не удалось завершить некоторые операции — требуется проверка.' : 'Пароль изменён. Остальные сессии завершены.'); }} />}
    {error}
  </section></div>;
}
