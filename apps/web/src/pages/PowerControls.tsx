import { getTvErrorMessage } from '../tv-connection.js';
import { i18n, useTranslation } from '../i18n.js';
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconInfoCircle, IconPower, IconX } from "@tabler/icons-react";
import type {
  TvPowerOperation,
  TvPowerState,
  TvId,
  TvPlatform,
} from "@remote-webos-tv/contracts";
import { useTvPower } from "../useTvPower.js";

interface Props {
  tvId?: TvId;
  platform?: TvPlatform;
  csrfToken: string;
  active: boolean;
  onSessionExpired(): void;
  onStateChange?(state: TvPowerState | null): void;
  onBusyChange?(busy: boolean): void;
  settingsTarget?: HTMLElement | null;
  activityTarget?: HTMLElement | null;
  settingsOpen?: boolean;
  onConfirmationChange?(confirming: boolean): void;
  quietOffline?: boolean;
  serverUnavailable?: boolean;
}

function progress(
  operation: TvPowerOperation,
  platform: TvPlatform,
): string {
  if (operation.action === "recover") return "";
  if (operation.action === "wake") {
    if (operation.status === "succeeded") return "";
    if (operation.delivery === "sent") return "";
    if (operation.delivery === "unknown")
      return i18n.t('unknownDelivery', { ns: 'devices' });
    return "";
  }
  if (operation.status === "succeeded") {
    if (platform === "tizen") return "";
    return i18n.t('shutdownUnconfirmed', { ns: 'devices' });
  }
  if (operation.delivery === "sent") return "";
  if (operation.delivery === "unknown")
    return i18n.t('shutdownDeliveryUnknown', { ns: 'devices' });
  return "";
}

function terminalError(
  operation: TvPowerOperation | null | undefined,
  platform: TvPlatform,
): string {
  if (
    !operation ||
    operation.status === "running" ||
    operation.status === "succeeded"
  )
    return "";
  if (operation.action === "wake" && operation.delivery === "not_sent" &&
    ["NETWORK_UNREACHABLE", "CONNECTION_LOST", "TV_UNAVAILABLE", "UNKNOWN"].includes(operation.error?.code ?? ""))
    return i18n.t('wakeSendFailed', { ns: 'devices' });
  const messages: Readonly<Record<string, string>> = {
    ...(platform === "tizen"
      ? {
          NETWORK_UNREACHABLE:
            i18n.t('controlConnectFailed', { ns: 'devices' }),
        }
      : {}),
    RECOVERY_TIMEOUT:
      operation.action === "wake"
        ? i18n.t('wakeTimeout', { ns: 'devices' })
        : i18n.t('connectTimeout', { ns: 'devices' }),
    AUTHORIZATION_FAILED:
      i18n.t('keyRejected', { ns: 'devices' }),
    INVALID_TV_RESPONSE:
      i18n.t('compatibilityHint', { ns: 'devices' }),
    UNSUPPORTED_CAPABILITY: i18n.t('commandUnsupported', { ns: 'devices' }),
    POWER_OFF_UNCONFIRMED:
      i18n.t('checkShutdown', { ns: 'devices' }),
    CANCELLED: i18n.t('operationCancelled', { ns: 'devices' }),
  };
  const detail =
    messages[operation.error?.code ?? ""] ||
    getTvErrorMessage(operation.error) ||
    i18n.t('operationIncomplete', { ns: 'devices' });
  return operation.delivery === "unknown"
    ? i18n.t('unknownDeliveryDetail', { ns: 'devices', detail })
    : detail;
}

export function PowerControls({
  tvId,
  platform = "webos",
  csrfToken,
  active,
  onSessionExpired,
  onStateChange,
  onBusyChange,
  settingsTarget,
  activityTarget,
  settingsOpen = false,
  onConfirmationChange,
  quietOffline = false,
  serverUnavailable = false,
}: Props) {
  useTranslation('devices');
  const networkHelpId = useId();
  const {
    state,
    loading,
    error,
    message,
    busy,
    refresh,
    start,
    saveMac,
    cancel,
  } = useTvPower(active, csrfToken, onSessionExpired, tvId);
  const [mac, setMac] = useState("");
  const [confirming, setConfirming] = useState(false);
  const alert = useRef<HTMLParagraphElement>(null);
  const confirmation = useRef<HTMLButtonElement>(null);
  const powerButton = useRef<HTMLButtonElement>(null);
  const confirmationPanel = useRef<HTMLDivElement>(null);
  function dismissConfirmation() {
    setConfirming(false);
    powerButton.current?.focus();
  }
  useEffect(() => {
    if (!confirming) return;
    function outside(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !confirmationPanel.current?.contains(event.target) &&
        !powerButton.current?.contains(event.target)
      )
        dismissConfirmation();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismissConfirmation();
    }
    document.addEventListener("click", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("click", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [confirming]);
  const operation = state?.operation;
  const running = operation?.status === "running";
  const [expiredShutdownWarning, setExpiredShutdownWarning] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (
      !active ||
      operation?.status !== "failed" ||
      operation.delivery !== "sent" ||
      operation.error?.code !== "POWER_OFF_UNCONFIRMED"
    )
      return;
    const timer = setTimeout(
      () => setExpiredShutdownWarning(operation.id),
      5000,
    );
    return () => clearTimeout(timer);
  }, [
    active,
    operation?.id,
    operation?.status,
    operation?.delivery,
    operation?.error?.code,
  ]);
  const activityBusy = active && (busy || loading || !!state?.busy || running);
  useEffect(() => {
    onBusyChange?.(activityBusy);
  }, [activityBusy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const conflicting = !!state?.canPowerOff && state.canWake;
  const samsung = platform === "tizen";
  const powerAction = conflicting
    ? null
    : state?.canPowerOff && (!samsung || state.observedPower === "on")
      ? "power_off"
      : state?.canWake && (samsung ? state.observedPower !== "on" : state.mac)
        ? "wake"
        : null;
  const disabled = busy || loading || !!error || !state || running;
  const powerDisabled =
    serverUnavailable ||
    settingsOpen ||
    busy ||
    loading ||
    !!error ||
    !state ||
    !powerAction ||
    (running && !(powerAction === "wake" && operation?.action === "recover"));
  const diagnostic =
    message ||
    (serverUnavailable ? "" : error) ||
    (conflicting
      ? i18n.t('powerConflict', { ns: 'devices' })
      : terminalError(operation, platform));
  const backgroundDiagnostic =
    !message &&
    !error &&
    !conflicting &&
    operation?.delivery === "sent" &&
    operation.error?.code === "POWER_OFF_UNCONFIRMED" &&
    operation.id === expiredShutdownWarning
      ? ""
      : diagnostic;
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);
  useEffect(() => {
    if (state) setMac(state.mac ?? "");
  }, [state?.mac, settingsOpen]);
  useEffect(() => {
    onConfirmationChange?.(confirming);
  }, [confirming, onConfirmationChange]);
  useEffect(() => () => onConfirmationChange?.(false), [onConfirmationChange]);
  useEffect(() => {
    if (!active || powerAction !== "power_off" || powerDisabled)
      setConfirming(false);
  }, [active, powerAction, powerDisabled]);
  useEffect(() => {
    if (confirming) confirmation.current?.focus();
  }, [confirming]);
  // Modal transitions do not refocus an existing background diagnostic.
  useEffect(() => {
    if (backgroundDiagnostic && !settingsOpen)
      alert.current?.focus({ preventScroll: true });
  }, [backgroundDiagnostic]);

  if (!active) return null;
  const networkPowerUnsupported = state?.wakeSupported === false;
  const unknownSamsungPower =
    samsung &&
    !!state &&
    state.observedPower !== "on" &&
    state.observedPower !== "standby";
  const unavailable = samsung
    ? state?.observedPower === "standby"
      ? i18n.t('powerUnavailable', { ns: 'devices' })
      : state?.observedPower === "on"
        ? i18n.t('powerUnavailable', { ns: 'devices' })
        : i18n.t('powerUnknown', { ns: 'devices' })
    : networkPowerUnsupported
      ? i18n.t('wakeUnsupported', { ns: 'devices' })
      : !state?.mac
        ? i18n.t('needMac', { ns: 'devices' })
        : i18n.t('powerUnavailable', { ns: 'devices' });
  // Only the retained background diagnostic owns autofocus; modal teardown
  // must not clear its ref while the background paragraph remains mounted.
  const suppressReadStatus = serverUnavailable && !message &&
    (!operation || (!running && operation.status !== "succeeded"));
  const activity = (withFocusRef: boolean) => (
    <>
      <p role="status" aria-label={i18n.t('powerAria', { ns: 'devices' })} aria-live="polite">
        {suppressReadStatus ? "" : error || (unknownSamsungPower && !activityBusy)
          ? i18n.t('powerUnknown', { ns: 'devices' })
          : operation && (running || operation.status === "succeeded")
            ? progress(operation, platform)
            : !activityBusy && !powerAction && !diagnostic
              ? unavailable
              : ""}
      </p>
      {(withFocusRef ? backgroundDiagnostic : diagnostic) && (
        <p
          ref={withFocusRef ? alert : undefined}
          tabIndex={-1}
          role="alert"
          className="error"
        >
          {withFocusRef ? backgroundDiagnostic : diagnostic}
        </p>
      )}
      {running && (
        <div>
          {operation.action !== "recover" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => cancel(operation.id)}
            >
              {i18n.t('cancelWait', { ns: 'devices' })}</button>
          )}
        </div>
      )}
    </>
  );
  const settings = samsung ? null : networkPowerUnsupported ? (
    <section className="settings-section">
      <h3>{i18n.t('networkWake', { ns: 'devices' })}</h3>
      {settingsOpen ? activity(false) : <p>{unavailable}</p>}
    </section>
  ) : (
    <section className="settings-section">
      <div className="settings-network-heading">
        <h3>{i18n.t('networkWake', { ns: 'devices' })}</h3>
        <button
          className="settings-help"
          type="button"
          aria-label={i18n.t('aboutNetworkWake', { ns: 'devices' })}
          aria-describedby={networkHelpId}
        >
          <IconInfoCircle aria-hidden="true" />
        </button>
        <div className="settings-tooltip" id={networkHelpId} role="tooltip">
          <p>
            {i18n.t('networkMacHint', { ns: 'devices' })}</p>
          <p>
            {i18n.t('wakeHint', { ns: 'devices' })}</p>
        </div>
      </div>
      {settingsOpen && activity(false)}
      <form
        className="settings-edit-row"
        onSubmit={(event) => {
          event.preventDefault();
          saveMac(mac.trim() || null);
        }}
        noValidate
      >
        <label>
          {i18n.t('mac', { ns: 'devices' })}<input
            autoComplete="off"
            value={mac}
            disabled={disabled}
            onChange={(event) => setMac(event.target.value)}
          />
        </label>
        <button className="settings-primary" type="submit" disabled={disabled}>
          {i18n.t('saveMac', { ns: 'devices' })}</button>
      </form>
      <div className="settings-actions">
        <button
          type="button"
          disabled={disabled || !state?.mac}
          onClick={() => saveMac(null)}
        >
          {i18n.t('clearMac', { ns: 'devices' })}</button>
        <button type="button" disabled={loading} onClick={refresh}>
          {i18n.t('refreshPower', { ns: 'devices' })}</button>
      </div>
    </section>
  );
  const quietRecovery =
    quietOffline &&
    !(samsung && state?.observedPower === "standby") &&
    !unknownSamsungPower &&
    !message &&
    !error &&
    !conflicting &&
    (!operation ||
      (operation.action === "recover" &&
        (!operation.error ||
          ["RECOVERY_TIMEOUT", "CONNECTION_LOST", "TV_UNAVAILABLE"].includes(
            operation.error.code,
          ))));
  const backgroundActivity = (
    <div
      className={settingsOpen ? "reserved-activity" : undefined}
      aria-hidden={settingsOpen || undefined}
      inert={settingsOpen}
    >
      {!quietRecovery && !(activityTarget && running) && activity(true)}
    </div>
  );
  const powerConfirmation = confirming && (
    <div
      ref={confirmationPanel}
      className="power-confirmation"
      role="dialog"
      aria-label={i18n.t('powerOffTitle', { ns: 'devices' })}
    >
      <div className="power-confirm-heading">
        <IconPower aria-hidden="true" />
        <h3>{i18n.t('powerOffShortTitle', { ns: 'devices' })}</h3>
        <button
          className="power-confirm-close"
          type="button"
          aria-label={i18n.t('closeConfirm', { ns: 'devices' })}
          onClick={dismissConfirmation}
        >
          <IconX aria-hidden="true" />
        </button>
      </div>
      <div className="power-confirm-actions">
        <button ref={confirmation} type="button" onClick={dismissConfirmation}>
          {i18n.t('cancel', { ns: 'devices' })}</button>
        <button
          className="power-confirm-submit"
          type="button"
          disabled={powerDisabled}
          onClick={() => {
            setConfirming(false);
            start("power_off");
          }}
        >
          {i18n.t('powerOff', { ns: 'devices' })}</button>
      </div>
      {!samsung && (
        <details className="power-confirm-details">
          <summary>
            <IconInfoCircle aria-hidden="true" />{i18n.t('aboutPower', { ns: 'devices' })}</summary>
          <p>
            {i18n.t('lostNotShutdown', { ns: 'devices' })}</p>
        </details>
      )}
    </div>
  );
  return (
    <div
      className="power-controls"
      role="group"
      aria-label={i18n.t('powerAria', { ns: 'devices' })}
      aria-busy={busy}
    >
      <h2 className="visually-hidden">{i18n.t('powerAria', { ns: 'devices' })}</h2>
      {activityTarget
        ? createPortal(backgroundActivity, activityTarget)
        : backgroundActivity}
      <button
        className="power-button"
        ref={powerButton}
        type="button"
        aria-label={
          powerAction === "power_off"
            ? i18n.t('powerOffShort', { ns: 'devices' })
            : powerAction === "wake"
              ? i18n.t('wakeShort', { ns: 'devices' })
              : i18n.t('powerShort', { ns: 'devices' })
        }
        title={
          powerAction === "power_off"
            ? i18n.t('powerOffShort', { ns: 'devices' })
            : powerAction === "wake"
              ? i18n.t('wakeShort', { ns: 'devices' })
              : i18n.t('powerShort', { ns: 'devices' })
        }
        disabled={powerDisabled}
        onClick={() => {
          if (powerDisabled) return;
          if (powerAction === "power_off") setConfirming(true);
          else if (powerAction === "wake") start("wake");
        }}
      >
        <IconPower aria-hidden="true" />
      </button>
      {powerConfirmation}
      {settingsTarget ? createPortal(settings, settingsTarget) : settings}
    </div>
  );
}
