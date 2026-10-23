import {i18n,useTranslation} from '../i18n.js';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { IconX } from '@tabler/icons-react';

interface Props { busy?: boolean; open: boolean; onClose(): void; children: ReactNode; footer?: ReactNode; title?: string; closeLabel?: string; dismissOnBackdrop?: boolean; className?: string }

export function SettingsDialog({ open, onClose, children, footer, title = i18n.t('auth:tvSettings'), closeLabel = i18n.t('auth:closeSettings'), busy = false, dismissOnBackdrop = true, className = '' }: Props) {
  useTranslation('auth');
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      closeButton.current?.focus();
    } else if (!open && element.open) {
      element.close();
      if (opener.current?.isConnected) opener.current.focus();
    }
  }, [open]);
  useLayoutEffect(() => {
    const element = dialog.current;
    return () => {
      if (!element?.open) return;
      element.close();
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, []);
  return <dialog ref={dialog} tabIndex={0} aria-label={title} className={['settings-dialog',className].filter(Boolean).join(' ')} onCancel={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); onClose(); }} onClick={(event) => {
    if (!dismissOnBackdrop) return;
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <div className="settings-heading"><h2>{title}</h2><button ref={closeButton} type="button" aria-label={closeLabel} disabled={busy} onClick={onClose}><IconX aria-hidden="true" /></button></div>
    <div className="settings-content">{children}</div>
    {footer && <div className="settings-footer">{footer}</div>}
  </dialog>;
}
