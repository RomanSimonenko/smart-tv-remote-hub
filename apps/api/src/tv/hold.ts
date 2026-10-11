import type { TvCommandResult, TvHoldRequest } from '@remote-webos-tv/contracts';
import { TvButtonSendError, type TvAdapter } from '@remote-webos-tv/tv-adapter';
import { rejectTvCommand, unknownTvCommand } from './commands.js';
import type { TvScheduler } from './service.js';
import { abortable } from './operation.js';

interface Receipt {
  input: TvHoldRequest;
  owner: string;
  adapter: TvAdapter;
  controller: AbortController;
  press: Promise<TvCommandResult>;
  release?: Promise<TvCommandResult>;
  timer?: unknown;
  finishedAt?: number;
  detach(): void;
  pressUnsettled: boolean;
  unsafePress: boolean;
}

/** Per-TV ownership. Browser cancellation never cancels the Release obligation. */
export function createTvHold(dependencies: {
  scheduler: TvScheduler;
  onUnsafe(adapter: TvAdapter): Promise<void>;
}) {
  const { scheduler } = dependencies;
  const receipts = new Map<string, Receipt>();
  let active: Receipt | undefined;
  let cleanupFailure: unknown;
  const key = (owner: string, id: string) => JSON.stringify([owner, id]);
  function prune() {
    for (const [id, receipt] of receipts) {
      if (receipt.finishedAt !== undefined && scheduler.now() - receipt.finishedAt >= 60_000) receipts.delete(id);
    }
  }
  function finish(receipt: Receipt) {
    scheduler.clearTimeout(receipt.timer);
    receipt.detach();
    receipt.finishedAt = scheduler.now();
    if (active === receipt) active = undefined;
  }
  function releaseReceipt(receipt: Receipt): Promise<TvCommandResult> {
    if (receipt.release) return receipt.release;
    receipt.release = (async () => {
      const pressed = await receipt.press;
      if (pressed.outcome === 'rejected') { finish(receipt); return pressed; }
      const controller = new AbortController();
      let timer: unknown;
      try {
        if (receipt.unsafePress) throw new Error('TV hold Press did not settle before cancellation');
        const timeout = new Promise<never>((_, reject) => {
          timer = scheduler.setTimeout(() => {
            controller.abort();
            reject(new Error('TV hold release budget expired'));
          }, 2_000);
        });
        await Promise.race([receipt.adapter.releaseButton!(receipt.input.button, controller.signal), timeout]);
        return pressed.outcome === 'sent' ? { id: receipt.input.id, outcome: 'sent' as const } : unknownTvCommand(receipt.input.id);
      } catch {
        // Keep the gate occupied until the uncertain transport has been closed.
        try { await dependencies.onUnsafe(receipt.adapter); }
        catch (cause) { cleanupFailure = cause; }
        return unknownTvCommand(receipt.input.id);
      } finally {
        scheduler.clearTimeout(timer);
        if (!cleanupFailure) finish(receipt);
      }
    })();
    return receipt.release;
  }
  return {
    busy: () => active !== undefined,
    isHolding: (id: string, owner: string) => active?.input.id === id && active.owner === owner,
    has(input: TvHoldRequest, owner: string): boolean { prune(); return receipts.has(key(owner, input.id)); },
    press(input: TvHoldRequest, owner: string, adapter: TvAdapter, signal: AbortSignal, admit?: () => void): Promise<TvCommandResult> {
      prune();
      const existing = receipts.get(key(owner, input.id));
      if (existing) return existing.input.button === input.button ? existing.press : Promise.resolve(rejectTvCommand(input.id, 'COMMAND_NOT_SENT'));
      if (active) return Promise.resolve(rejectTvCommand(input.id, 'TV_BUSY'));
      if (signal.aborted) return Promise.resolve(rejectTvCommand(input.id, 'COMMAND_NOT_SENT'));
      // The replay decision and new admission share this synchronous boundary.
      // A preflight classification can expire before the transport is acquired.
      admit?.();
      if (!adapter.pressButton || !adapter.releaseButton || !adapter.nativeHoldButtons?.includes(input.button)) {
        return Promise.resolve(rejectTvCommand(input.id, 'UNSUPPORTED_CAPABILITY'));
      }
      // Capacity eviction applies only to a new admission, never to a replay.
      if (receipts.size >= 256) receipts.delete(receipts.keys().next().value!);
      const controller = new AbortController();
      const receipt: Receipt = { input, owner, adapter, controller, press: Promise.resolve(rejectTvCommand(input.id, 'COMMAND_NOT_SENT')), detach() {}, pressUnsettled: true, unsafePress: false };
      active = receipt;
      receipts.set(key(owner, input.id), receipt);
      receipt.press = Promise.resolve().then(async () => {
        if (signal.aborted || controller.signal.aborted) return rejectTvCommand(input.id, 'COMMAND_NOT_SENT');
        try {
          const work = adapter.pressButton!(input.button, controller.signal).finally(() => { receipt.pressUnsettled = false; });
          await abortable(work, controller.signal);
          return controller.signal.aborted ? unknownTvCommand(input.id) : { id: input.id, outcome: 'sent' as const };
        } catch (cause) {
          receipt.unsafePress = controller.signal.aborted && receipt.pressUnsettled;
          if (cause instanceof TvButtonSendError && cause.delivery === 'not_sent') return rejectTvCommand(input.id, 'COMMAND_NOT_SENT');
          return unknownTvCommand(input.id);
        }
      });
      const stop = () => { void releaseReceipt(receipt); };
      signal.addEventListener('abort', stop, { once: true });
      receipt.detach = () => signal.removeEventListener('abort', stop);
      receipt.timer = scheduler.setTimeout(() => { controller.abort(); stop(); }, 5_000);
      void receipt.press.then((result) => { if (result.outcome !== 'sent') stop(); });
      return receipt.press;
    },
    release(input: TvHoldRequest, owner: string): Promise<TvCommandResult> {
      const receipt = receipts.get(key(owner, input.id));
      if (!receipt || receipt.input.button !== input.button) return Promise.resolve(rejectTvCommand(input.id, 'COMMAND_NOT_SENT'));
      return releaseReceipt(receipt);
    },
    async stop(owner?: string): Promise<void> {
      if (active && (owner === undefined || active.owner === owner)) await releaseReceipt(active);
      if (cleanupFailure) throw cleanupFailure;
    },
  };
}
