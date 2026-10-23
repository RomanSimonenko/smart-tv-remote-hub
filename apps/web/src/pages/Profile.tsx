import {useTranslation} from '../i18n.js';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { IconDeviceDesktop, IconRestore } from '@tabler/icons-react';
import { profileAvatarIds, profileUpdateSchema, type OwnerProfile, type ProfileUpdate } from '@remote-webos-tv/contracts';
import { browserEngineLabel } from '../browserEngine.js';
import { ProfileAvatar, avatarOptions } from '../components/ProfileAvatar.js';

interface Props { securityAction?: ReactNode; sessionAction?: ReactNode; profile: OwnerProfile; saving: boolean; error: string; onSave(value: ProfileUpdate): Promise<boolean>; onDirtyChange(dirty: boolean): void }
export function Profile({ profile, saving, error, onSave, onDirtyChange, sessionAction, securityAction }: Props) {
  const {t}=useTranslation('auth');
  const nameId = useId(), usernameId = useId();
  const [displayName, setName] = useState(profile.displayName);
  const [avatarId, setAvatar] = useState(profile.avatarId);
  const [saved, setSaved] = useState(false);
  const dirty = displayName !== profile.displayName || avatarId !== profile.avatarId;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const parsed = profileUpdateSchema.safeParse({ displayName, avatarId });
  return <section className="owner-profile" aria-labelledby="profile-title">
    <h1 id="profile-title">{t('myProfile')}</h1><p className="profile-caption">{t('profileCaption')}</p>
    <form onSubmit={async event => { event.preventDefault(); if (!parsed.success || !dirty || saving) return; setSaved(false); const success = await onSave(parsed.data); if (success) { setName(parsed.data.displayName); setSaved(true); } }}>
      <div className="profile-identity"><div className="profile-intro"><ProfileAvatar avatarId={avatarId} displayName={displayName || profile.username} /><div><h2>{profile.displayName}</h2><span className="profile-role">{t('owner')}</span></div></div>
      <fieldset disabled={saving} className="avatar-picker"><legend>{t('profileIcon')}</legend><div className="avatar-grid">
        {profileAvatarIds.map(id => { const { label, Icon } = avatarOptions[id]; return <label className="avatar-choice" key={id} title={t(label)}><input type="radio" name="avatar" checked={avatarId === id} onChange={() => { setAvatar(id); setSaved(false); }} /><Icon aria-hidden="true" /><span className="avatar-label">{t(label)}</span></label>; })}
      </div><label className="avatar-reset"><input type="radio" name="avatar" checked={avatarId === null} onChange={() => { setAvatar(null); setSaved(false); }} aria-label={t('initials')} /><IconRestore aria-hidden="true" />{t('restoreInitials')}</label></fieldset></div>
      <section className="profile-fields" aria-label={t('profileDetails')}>
        <label htmlFor={nameId}>{t('displayName')}</label><input id={nameId} value={displayName} disabled={saving} onChange={event => { setName(event.target.value); setSaved(false); }} aria-describedby={`${nameId}-help`} /><p id={`${nameId}-help`}>{t('nameLength')}</p>
        <label htmlFor={usernameId}>{t('accountUsername')}</label><input id={usernameId} value={profile.username} readOnly /><p>{t('usernameHelp')}</p>
      </section>
      {error && <p role="alert">{error}</p>}
      <div className="profile-save-actions">
      <button type="submit" className="primary" disabled={!dirty || !parsed.success || saving}>{saving ? t('saving') : t('saveChanges')}</button>{saved && !dirty && <p role="status">{t('saved')}</p>}</div>
    </form>
    {securityAction && <section className="profile-security"><h2>{t('security')}</h2><p className="profile-caption">{t('securityHelp')}</p>{securityAction}</section>}
    <section className="profile-session"><h2>{t('currentSession')}</h2><p className="profile-caption">{t('sessionHelp')}</p><div className="profile-session-row"><IconDeviceDesktop aria-hidden="true" /><div><h3>{browserEngineLabel(navigator.userAgent)}</h3><p>{t('activeSession')}</p></div>{sessionAction}</div></section>
  </section>;
}
