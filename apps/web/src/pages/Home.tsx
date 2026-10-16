import {TestRunner} from './TestRunner.js';
import {TestRuns} from './TestRuns.js';
import {TestRunReport} from './TestRunReport.js';
import {readNavigation,writeNavigation,type Screen} from '../navigation-state.js';
import type {TestCaseDraft} from '@remote-webos-tv/contracts';
import { TestCases } from './TestCases.js';
import { TestCaseEditor } from './TestCaseEditor.js';
import { useTestCases } from '../useTestCases.js';
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

interface Props { onUnsavedCaseChange?(dirty:boolean):void; onPasswordChange?(input: PasswordChangeRequest): Promise<PasswordChangeResponse>; username: string; csrfToken: string; tvActive: boolean; busy: boolean; error: ReactNode; onLogout(): void; onSessionExpired(): void }
export function Home({ username, csrfToken, tvActive, busy, error, onLogout, onSessionExpired, onPasswordChange, onUnsavedCaseChange }: Props) {
  const props = { ...(onUnsavedCaseChange ? {onUnsavedCaseChange} : {}), ...(onPasswordChange ? { onPasswordChange } : {}), username, csrfToken, tvActive, busy, error, onLogout, onSessionExpired };
  return <HomeContent {...props} />;
}
function HomeContent({ username, csrfToken, tvActive, busy, error, onLogout, onSessionExpired, onPasswordChange, onUnsavedCaseChange }: Props) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState('');
  const preferences = useUiPreferences();
  const owner = useOwnerProfile(csrfToken, onSessionExpired, tvActive);
  const [profileVersion, setProfileVersion] = useState(0);
  const [profileDirty, setProfileDirty] = useState(false);
  const [caseDirty, setCaseDirty] = useState(false);
  const [runBusy,setRunBusy]=useState(false);
  const [pendingRun,setPendingRun]=useState(false);
  const [caseValidation,setCaseValidation]=useState('');
  useEffect(() => { onUnsavedCaseChange?.(caseDirty); }, [caseDirty,onUnsavedCaseChange]);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  function requestLeave(action: () => void) {
    if (runBusy || owner.saving || cases.saving || cases.opening) return;
    setPendingRun(false);
    if (profileDirty || caseDirty) setPendingLeave(() => action); else action();
  }
  useEffect(() => {
    if (!profileDirty && !caseDirty && !runBusy) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [profileDirty, caseDirty,runBusy]);
  const [initialNavigation]=useState(()=>readNavigation(username));
  const [screen,setScreen]=useState<Screen>(initialNavigation.screen);
  const [runnerCaseId,setRunnerCaseId]=useState(initialNavigation.screen==='runner'?initialNavigation.caseId:'');
  const [reportId,setReportId]=useState(initialNavigation.screen==='report'?initialNavigation.runId:'');
  function openRunner(id:string){if(runBusy)return;const open=()=>{setReportId('');setRunnerCaseId(id);navigate('runner');};if(caseDirty){setPendingRun(true);setPendingLeave(()=>open);}else open();}
  function openCaseFromReport(id:string){requestLeave(()=>{setImportDraft(null);void cases.open(id).then(opened=>{if(opened)navigate('editor');else setNavigationError('Не удалось открыть тест-кейс. Откройте его из списка тест-кейсов.');});});}
 function openReport(id:string){setReportId(id);navigate('report');}
  const [restoringCase,setRestoringCase]=useState(initialNavigation.screen==='editor');
  const restored=useRef(false);
  const [navigationError,setNavigationError]=useState('');
  const [importDraft,setImportDraft]=useState<TestCaseDraft|null>(null);
  const cases = useTestCases(csrfToken, onSessionExpired, tvActive && (screen === 'cases' || screen === 'editor'), screen === 'cases');
  const [tvId, setTvId] = useState<TvId | null>(initialNavigation.screen==='remote'?initialNavigation.tvId:null);
  const [platform, setPlatform] = useState<TvPlatform>(initialNavigation.screen==='remote'?initialNavigation.platform:'webos');
  useEffect(()=>{
    if(!tvActive||restored.current)return;
    restored.current=true;
    if(initialNavigation.screen==='editor'){
      if(initialNavigation.caseId)void cases.open(initialNavigation.caseId).then(opened=>{setRestoringCase(false);if(!opened)setScreen('cases');});
      else {cases.create();setRestoringCase(false);}
    }
  },[tvActive]);
  useEffect(()=>{
    if(!tvActive||restoringCase)return;
    try{
      if(screen==='remote'){if(!tvId)return;writeNavigation(username,{screen,tvId,platform});}
      else if(screen==='editor')writeNavigation(username,cases.current?{screen,caseId:cases.current.id}:{screen});
      else if(screen==='runner'){if(reportId)writeNavigation(username,{screen:'report',runId:reportId});else if(runnerCaseId)writeNavigation(username,{screen,caseId:runnerCaseId});}
      else if(screen==='report'){if(reportId)writeNavigation(username,{screen,runId:reportId});}
      else writeNavigation(username,{screen});
      setNavigationError('');
    }catch{setNavigationError('Не удалось запомнить текущий экран. После обновления может открыться список телевизоров.');}
  },[screen,tvId,platform,cases.current?.id,restoringCase,tvActive,username,runnerCaseId,reportId]);
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
  useEffect(() => { if (!tvActive) { setSettingsOpen(false); setConfirmingPower(false); setPendingLeave(null); } }, [tvActive]);
  function navigate(next: typeof screen) {
    setProfileDirty(false); setCaseDirty(false); setSettingsOpen(false); setConfirmingPower(false); setScreen(next);
    if (help.current) help.current.open = false;
  }
  return <div className="app-workspace" data-collapsed={preferences.collapsed}>
    <AppSidebar collapsed={preferences.collapsed} onToggleCollapsed={() => preferences.setCollapsed(!preferences.collapsed)} username={owner.profile?.displayName ?? username} avatarId={owner.profile?.avatarId ?? null} activeSection={['runs','runner','report'].includes(screen)?'runs':screen === 'profile' ? 'profile' : screen === 'cases' || screen === 'editor' ? 'cases' : 'televisions'} onOpenRuns={()=>requestLeave(()=>navigate('runs'))} onOpenTestCases={() => { if (screen !== 'cases') requestLeave(() => navigate('cases')); }} disabled={runBusy || passwordOpen || !tvActive || busy || settingsOpen || confirmingPower || confirmingLogout || !!pendingLeave || owner.saving || cases.saving || cases.opening} onOpenTelevisions={() => { if (screen !== 'dashboard') requestLeave(() => navigate('dashboard')); }} onOpenProfile={() => { if (screen !== 'profile') requestLeave(() => navigate('profile')); }} />
    <section className="app-content" data-screen={screen}>
    {navigationError&&<p role="status">{navigationError}</p>}
    {preferences.persistenceError && <p className="preferences-warning" role="status">{preferences.persistenceError}</p>}
    <header className="app-header" hidden={screen === 'profile' || screen === 'editor'||screen==='runner'||screen==='report'}>
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
        <button ref={settingsButton} type="button" aria-label={screen === 'remote' ? 'Настройки ТВ' : 'Аккаунт'} title={screen === 'remote' ? 'Настройки ТВ' : 'Аккаунт'} aria-haspopup="dialog" disabled={!tvActive || confirmingPower || !!pendingLeave || owner.saving || cases.saving || cases.opening} onClick={() => { settingsButton.current?.focus(); setSettingsOpen(true); }}><IconSettings aria-hidden="true" /><span>{screen === 'remote' ? 'Настройки ТВ' : 'Аккаунт'}</span></button>
        <button ref={screen === 'profile' ? undefined : logoutButton} type="button" aria-haspopup="dialog" disabled={busy || confirmingPower || !!pendingLeave || owner.saving || cases.saving || cases.opening} onClick={() => requestLeave(() => { setSettingsOpen(false); setConfirmingLogout(true); })}>{busy ? 'Выход…' : 'Выйти'}</button>
      </div>
    </header>
    <LogoutConfirmation open={confirmingLogout && !busy} anchor={logoutButton} onClose={() => setConfirmingLogout(false)} onConfirm={() => { setConfirmingLogout(false); onLogout(); }} />
    <SettingsDialog title="Несохранённые изменения" closeLabel={caseDirty ? 'Закрыть диалог' : 'Остаться в профиле'} busy={cases.saving} open={!!pendingLeave} onClose={() => { if (!cases.saving){setPendingLeave(null);setPendingRun(false);} }}><p>{caseDirty ? 'Изменения тест-кейса не сохранены.' : 'Изменения профиля не сохранены. Покинуть страницу?'}</p>{(cases.error || caseValidation) && caseDirty && <p role="alert">{cases.error || caseValidation}</p>}<div className="profile-leave-actions"><button type="button" disabled={cases.saving} onClick={() => {setPendingLeave(null);setPendingRun(false);}}>{caseDirty ? 'Продолжить редактирование' : 'Остаться'}</button>{caseDirty && <button type="submit" form="test-case-form" disabled={cases.saving}>Сохранить и продолжить</button>}{!pendingRun&&<button type="button" disabled={cases.saving} onClick={() => { const leave = pendingLeave; setPendingLeave(null); setProfileDirty(false); setProfileVersion(value => value + 1); leave?.(); }}>Не сохранять и продолжить</button>}</div></SettingsDialog>
    {(tvActive || screen === 'editor') && (screen === 'runs'?<TestRuns onOpen={openReport} onSessionExpired={onSessionExpired}/>:screen==='runner'?<TestRunner key={runnerCaseId} caseId={runnerCaseId} csrfToken={csrfToken} onSessionExpired={onSessionExpired} onBack={()=>navigate('cases')} onOpenRuns={()=>navigate('runs')} onOpenCase={openCaseFromReport} onRunningChange={setRunBusy} onRunId={setReportId}/>:screen==='report'?<TestRunReport key={reportId} runId={reportId} onBack={()=>navigate('runs')} onNewRun={openRunner} onOpenCase={openCaseFromReport} onSessionExpired={onSessionExpired}/>:screen === 'cases' ? <TestCases onRun={openRunner} cases={cases.cases} loading={cases.loading || cases.opening} error={cases.error} onRetry={cases.refresh} onImport={draft=>{setImportDraft(draft);cases.create();navigate('editor');}} onCreate={() => { setImportDraft(null); cases.create(); navigate('editor'); }} onOpen={id => { setImportDraft(null); void cases.open(id).then(opened => { if (opened) navigate('editor'); }); }} /> : screen === 'editor' ? restoringCase?<p role="status">Загрузка тест-кейса…</p>:<TestCaseEditor onRun={()=>{if(cases.current)openRunner(cases.current.id);}} initialDraft={importDraft} conflict={cases.conflict} onValidationError={setCaseValidation} key={cases.editorKey} initialCase={cases.current} saving={cases.saving} error={cases.error} onDirtyChange={setCaseDirty} onBack={() => requestLeave(() => navigate('cases'))} onSave={async draft => { const saved=await cases.save(draft); if(saved) { setCaseDirty(false); if(pendingLeave) { const leave=pendingLeave;setPendingLeave(null);leave(); } } return saved; }} onReloadConflict={() => { if(cases.current) requestLeave(() => { void cases.open(cases.current!.id); }); }} /> : screen === 'profile' ? <>{owner.loading && !owner.profile ? <p role="status">Загрузка профиля…</p> : owner.profile ? <Profile securityAction={<><div className="profile-security-row"><IconKey aria-hidden="true" /><div><h3>Пароль</h3><p>Измените пароль для защиты вашего аккаунта.</p></div><button type="button" disabled={owner.saving || !onPasswordChange} onClick={() => requestLeave(() => { setPasswordNotice(''); setPasswordOpen(true); })}>Изменить пароль<IconChevronRight aria-hidden="true" /></button></div>{passwordNotice && <p role="status">{passwordNotice}</p>}</>} sessionAction={<button ref={logoutButton} type="button" aria-haspopup="dialog" disabled={busy || !!pendingLeave || owner.saving || cases.saving || cases.opening} onClick={() => requestLeave(() => { setSettingsOpen(false); setConfirmingLogout(true); })}>{busy ? 'Выход…' : 'Выйти'}</button>} key={profileVersion} profile={owner.profile} saving={owner.saving} error={owner.error} onSave={owner.save} onDirtyChange={setProfileDirty} /> : <div><p role="alert">{owner.error}</p><button type="button" onClick={owner.refresh}>Повторить загрузку профиля</button></div>}</> : screen === 'dashboard' ? <>
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
