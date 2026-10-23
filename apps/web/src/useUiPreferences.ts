import { useState } from 'react';
import {useTranslation} from './i18n.js';

const storageKey = 'smart-tv-remote-hub.ui-preferences.v1';
const persistenceMessage = 'Не удалось восстановить или сохранить вид меню. Изменения действуют до закрытия страницы.';
function readPreferences() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return { collapsed: false, persistenceError: '' };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !('collapsed' in value) || typeof value.collapsed !== 'boolean') {
      return { collapsed: false, persistenceError: persistenceMessage };
    }
    return { collapsed: value.collapsed, persistenceError: '' };
  } catch { return { collapsed: false, persistenceError: persistenceMessage }; }
}
export function useUiPreferences() {
  const {t}=useTranslation('common');
  const [preferences, setPreferences] = useState(readPreferences);
  function setCollapsed(collapsed: boolean) {
    let persistenceError = '';
    try { localStorage.setItem(storageKey, JSON.stringify({ collapsed })); }
    catch { persistenceError = persistenceMessage; }
    setPreferences({ collapsed, persistenceError });
  }
  return { ...preferences, persistenceError:preferences.persistenceError?t('menuStorageError'):'', setCollapsed };
}
