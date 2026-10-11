import { expect, test } from 'vitest';
import type { TvAdapter } from '@remote-webos-tv/tv-adapter';
import { createTvHold } from '../src/tv/hold.js';
import { barrier, ControlledScheduler, drain } from './support/tv-harness.js';

function fixture() {
  const scheduler = new ControlledScheduler();
  const press = barrier<void>();
  const frames: string[] = [];
  let closed = 0;
  const adapter = { nativeHoldButtons: ['RIGHT'],
    pressButton: async () => { frames.push('Press'); await press.promise; },
    releaseButton: async () => { frames.push('Release'); },
  } as unknown as TvAdapter;
  const hold = createTvHold({ scheduler, onUnsafe: async () => { closed++; } });
  const input = { id: '00000000-0000-4000-8000-000000000001', button: 'RIGHT' as const, phase: 'press' as const };
  return { hold, scheduler, press, frames, adapter, input, closed: () => closed };
}

test('early release waits for Press and duplicate phases never repeat transport work', async () => {
  const h = fixture();
  const pending = h.hold.press(h.input, 'owner', h.adapter, new AbortController().signal);
  const duplicate = h.hold.press(h.input, 'owner', h.adapter, new AbortController().signal);
  const released = h.hold.release({ ...h.input, phase: 'release' }, 'owner');
  await drain(); expect(h.frames).toEqual(['Press']);
  h.press.resolve();
  expect((await pending).outcome).toBe('sent'); expect(await duplicate).toEqual(await pending);
  expect((await released).outcome).toBe('sent');
  expect(await h.hold.release({ ...h.input, phase: 'release' }, 'owner')).toEqual(await released);
  expect(h.frames).toEqual(['Press', 'Release']); expect(h.hold.busy()).toBe(false);
});

test('foreign owner cannot release and terminal id cannot press again', async () => {
  const h = fixture(); const pending = h.hold.press(h.input, 'owner', h.adapter, new AbortController().signal);
  h.press.resolve(); await pending;
  expect((await h.hold.release({ ...h.input, phase: 'release' }, 'foreign')).outcome).toBe('rejected');
  expect(h.frames).toEqual(['Press']);
  await h.hold.stop('owner');
  await h.hold.press(h.input, 'owner', h.adapter, new AbortController().signal);
  expect(h.frames).toEqual(['Press', 'Release']);
});

test('server deadline releases without a browser request and no other TV is affected', async () => {
  const h = fixture(), other = fixture();
  const pending = h.hold.press(h.input, 'owner', h.adapter, new AbortController().signal);
  h.press.resolve(); await pending;
  h.scheduler.advance(5000); await drain();
  expect(h.frames).toEqual(['Press', 'Release']); expect(other.frames).toEqual([]);
  expect(h.hold.busy()).toBe(false);
});

test('failed release closes unsafe transport and remains unknown on replay', async () => {
  const h = fixture(); h.adapter.releaseButton = async () => { throw new Error('synthetic failure'); };
  const pending = h.hold.press(h.input, 'owner', h.adapter, new AbortController().signal);
  h.press.resolve(); await pending;
  const result = await h.hold.release({ ...h.input, phase: 'release' }, 'owner');
  expect(result.outcome).toBe('unknown'); expect(h.closed()).toBe(1);
  expect(await h.hold.release({ ...h.input, phase: 'release' }, 'owner')).toEqual(result);
});

test('an adapter ignoring cancellation cannot keep Press pending beyond the server budget', async () => {
  const h = fixture();
  const pending = h.hold.press(h.input, 'owner', h.adapter, new AbortController().signal);
  await drain();
  h.scheduler.advance(5000); await drain();
  expect(await pending).toMatchObject({ outcome: 'unknown' });
  expect(h.closed()).toBe(1);
  expect(h.frames).toEqual(['Press']);
  h.press.resolve(); await drain();
  expect(h.frames).toEqual(['Press']);
});

test('hanging Release expires after 2 seconds and closes the transport', async () => {
  const h = fixture(); const gate = barrier<void>();
  h.adapter.releaseButton = async () => { h.frames.push('Release'); await gate.promise; };
  const pressed = h.hold.press(h.input, 'owner', h.adapter, new AbortController().signal);
  h.press.resolve(); await pressed;
  const released = h.hold.release({ ...h.input, phase: 'release' }, 'owner'); await drain();
  h.scheduler.advance(1999); await drain(); expect(h.closed()).toBe(0); expect(h.hold.busy()).toBe(true);
  h.scheduler.advance(1); await drain();
  expect((await released).outcome).toBe('unknown'); expect(h.closed()).toBe(1); expect(h.hold.busy()).toBe(false);
  gate.resolve(); await drain(); expect(h.frames).toEqual(['Press', 'Release']);
});

test('an old receipt cannot release or press over a newer hold', async () => {
  const h = fixture(); const signal = new AbortController().signal;
  const first = h.hold.press(h.input, 'owner', h.adapter, signal); h.press.resolve(); await first;
  await h.hold.release({ ...h.input, phase: 'release' }, 'owner');
  const second = { ...h.input, id: '00000000-0000-4000-8000-000000000002' };
  await h.hold.press(second, 'owner', h.adapter, signal);
  await h.hold.release({ ...h.input, phase: 'release' }, 'owner'); await h.hold.press(h.input, 'owner', h.adapter, signal);
  expect(h.frames).toEqual(['Press', 'Release', 'Press']); expect(h.hold.isHolding(second.id, 'owner')).toBe(true);
  await h.hold.stop();
});

test('unsafe disconnect must finish before a new hold is admitted; failure stays observable', async () => {
  const scheduler = new ControlledScheduler(); const disconnect = barrier<void>();
  const hold = createTvHold({ scheduler, onUnsafe: () => disconnect.promise });
  const adapter = { nativeHoldButtons: ['RIGHT'], pressButton: async () => {}, releaseButton: async () => { throw new Error('release failed'); } } as unknown as TvAdapter;
  const input = fixture().input; const signal = new AbortController().signal;
  await hold.press(input, 'owner', adapter, signal);
  const release = hold.release({ ...input, phase: 'release' }, 'owner'); await drain();
  expect(hold.busy()).toBe(true);
  expect(await hold.press({ ...input, id: '00000000-0000-4000-8000-000000000002' }, 'other', adapter, signal)).toMatchObject({ outcome: 'rejected', error: { code: 'TV_BUSY' } });
  disconnect.reject(new Error('disconnect failed'));
  expect((await release).outcome).toBe('unknown'); expect(hold.busy()).toBe(true);
  await expect(hold.stop()).rejects.toThrow('disconnect failed');
});

test('a full receipt cache still deduplicates its retained ids', async () => {
  const h = fixture(); h.press.resolve(); const signal = new AbortController().signal;
  for (let index = 1; index <= 256; index++) {
    const input = { ...h.input, id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` };
    await h.hold.press(input, 'owner', h.adapter, signal);
    await h.hold.release({ ...input, phase: 'release' }, 'owner');
  }
  await h.hold.press(h.input, 'owner', h.adapter, signal);
  expect(h.frames).toHaveLength(512); expect(h.hold.busy()).toBe(false);
});
test.each(['abort', 'deadline'] as const)('cancellation before deferred Press sends nothing: %s', async ending => {
  const h = fixture(); const controller = new AbortController();
  const pending = h.hold.press(h.input, 'owner', h.adapter, controller.signal);
  if (ending === 'abort') controller.abort(); else h.scheduler.advance(5000);
  expect((await pending).outcome).toBe('rejected'); await drain();
  expect(h.frames).toEqual([]); expect(h.hold.busy()).toBe(false);
});
