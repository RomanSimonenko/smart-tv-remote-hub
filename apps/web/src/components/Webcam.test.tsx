import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Webcam } from './Webcam.js';

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
test('video mode defaults to source and changing it never starts the camera',()=>{
 const get=media();render(<Webcam/>);
 const toggle=screen.getByRole('switch',{name:'Выровнять экран'});
 expect(toggle.getAttribute('aria-checked')).toBe('false');
 fireEvent.click(toggle);
 expect(toggle.getAttribute('aria-checked')).toBe('true');
 expect(get).not.toHaveBeenCalled();
 fireEvent.click(toggle);
 expect(toggle.getAttribute('aria-checked')).toBe('false');
});
function media(getUserMedia = vi.fn()) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([{ kind: 'videoinput', deviceId: 'one', label: 'Camera One' }, { kind: 'videoinput', deviceId: 'two', label: 'Camera Two' }]) } });
  return getUserMedia;
}
function stream() { const stop = vi.fn(); return { value: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop }; }
test('returning from a hidden tab replaces the active camera stream but never enables a stopped camera', async () => {
  const first = stream(), second = stream();
  media(vi.fn().mockResolvedValueOnce(first.value).mockResolvedValueOnce(second.value));
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue('visible');
  const view = render(<Webcam />);
  fireEvent.click(screen.getByRole('button', { name: 'Включить камеру' }));
  await waitFor(() => expect(view.container.querySelector('video')?.srcObject).toBe(first.value));
  visibility.mockReturnValue('hidden'); fireEvent(document, new Event('visibilitychange'));
  visibility.mockReturnValue('visible'); fireEvent(document, new Event('visibilitychange'));
  await waitFor(() => expect(view.container.querySelector('video')?.srcObject).toBe(second.value));
  expect(first.stop).toHaveBeenCalledOnce();
  fireEvent.playing(view.container.querySelector('video')!);
  fireEvent.click(screen.getByRole('button', { name: 'Выключить камеру' }));
  visibility.mockReturnValue('hidden'); fireEvent(document, new Event('visibilitychange'));
  visibility.mockReturnValue('visible'); fireEvent(document, new Event('visibilitychange'));
  expect(view.container.querySelector('video')?.srcObject).toBeNull();
  expect(screen.getByText('Камера выключена')).toBeTruthy();
});
test('starts only on request, switches the selected camera and releases it on unmount', async () => {
  const first = stream(), second = stream();
  const get = media(vi.fn().mockResolvedValueOnce(first.value).mockResolvedValueOnce(second.value));
  const view = render(<Webcam />);
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Включить камеру' }));
  await waitFor(() => expect(view.container.querySelector('video')?.srcObject).toBe(first.value));
  expect(get).toHaveBeenCalledWith({ audio: false, video: {width:{ideal:1920},height:{ideal:1080}} });
  fireEvent.change(screen.getByLabelText('Камера'), { target: { value: 'two' } });
  await waitFor(() => expect(view.container.querySelector('video')?.srcObject).toBe(second.value));
  expect(first.stop).toHaveBeenCalledOnce();
  expect(get).toHaveBeenLastCalledWith({ audio: false, video: {width:{ideal:1920},height:{ideal:1080},deviceId: { exact: 'two' } } });
  view.unmount(); expect(second.stop).toHaveBeenCalledOnce();
});
test('tab recovery keeps the selected device and reports a failed reacquisition', async () => {
  const first = stream(), selected = stream();
  const get = media(vi.fn().mockResolvedValueOnce(first.value).mockResolvedValueOnce(selected.value).mockRejectedValueOnce(Object.assign(new Error('unavailable'), { name: 'NotReadableError' })));
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const view = render(<Webcam />);
  fireEvent.click(screen.getByRole('button', { name: 'Включить камеру' }));
  await waitFor(() => expect(view.container.querySelector('video')?.srcObject).toBe(first.value));
  fireEvent.change(screen.getByLabelText('Камера'), { target: { value: 'two' } });
  await waitFor(() => expect(view.container.querySelector('video')?.srcObject).toBe(selected.value));
  visibility.mockReturnValue('hidden'); fireEvent(document, new Event('visibilitychange'));
  visibility.mockReturnValue('visible'); fireEvent(document, new Event('visibilitychange'));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Камера недоступна. Возможно, её использует другое приложение.');
  expect(get).toHaveBeenLastCalledWith({ audio: false, video: {width:{ideal:1920},height:{ideal:1080},deviceId: { exact: 'two' } } });
  expect(selected.stop).toHaveBeenCalledOnce();
  expect(view.container.querySelector('video')?.srcObject).toBeNull();
  expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
});
test('stopping during permission request releases a late stream', async () => {
  let resolve!: (value: MediaStream) => void;
  media(vi.fn().mockReturnValue(new Promise<MediaStream>((done) => { resolve = done; })));
  const view = render(<Webcam />);
  fireEvent.click(screen.getByRole('button', { name: 'Включить камеру' }));
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  const late = stream(); await act(async () => resolve(late.value));
  expect(late.stop).toHaveBeenCalledOnce(); expect(view.container.querySelector('video')?.srcObject).toBeFalsy();
});
test('permission denial is visible and allows retry', async () => {
  media(vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')));
  render(<Webcam />); fireEvent.click(screen.getByRole('button', { name: 'Включить камеру' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Повторить' }) as HTMLButtonElement).disabled).toBe(false);
});
test('unsupported browser explains why the camera cannot start', () => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  render(<Webcam />); expect(screen.getByText(/Браузер не предоставляет/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Включить камеру' }) as HTMLButtonElement).disabled).toBe(true);
});

test('waiting feedback is delayed and cancelled when access resolves quickly', async () => {
  vi.useFakeTimers();
  try {
    let resolve!: (value: MediaStream) => void;
    media(vi.fn().mockReturnValue(new Promise<MediaStream>((done) => { resolve = done; })));
    render(<Webcam />);
    fireEvent.click(screen.getByRole('button', { name: 'Включить камеру' }));
    expect(screen.queryByText('Ожидаем доступ к камере…')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(399); });
    expect(screen.queryByText('Ожидаем доступ к камере…')).toBeNull();
    await act(async () => resolve(stream().value));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByText('Ожидаем доступ к камере…')).toBeNull();
  } finally { vi.useRealTimers(); }
});
test('slow permission shows waiting feedback and stopping clears its timer', async () => {
  vi.useFakeTimers();
  try {
    media(vi.fn().mockReturnValue(new Promise<MediaStream>(() => {})));
    render(<Webcam />);
    fireEvent.click(screen.getByRole('button', { name: 'Включить камеру' }));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.getByText('Ожидаем доступ к камере…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByText('Ожидаем доступ к камере…')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

 test('explains the empty preview and hides the placeholder only when video plays', async () => {
  const camera = stream();
  media(vi.fn().mockResolvedValue(camera.value));
  const view = render(<Webcam />);
  expect(screen.getByText('Камера выключена')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Включить камеру' }));
  expect(screen.getByText('Подключаем камеру…')).toBeTruthy();
  await waitFor(() => expect(view.container.querySelector('video')?.srcObject).toBe(camera.value));
  expect(screen.getByText('Подключаем камеру…')).toBeTruthy();
  fireEvent.playing(view.container.querySelector('video')!);
  expect(screen.queryByText('Подключаем камеру…')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Выключить камеру' }));
  expect(screen.getByText('Камера выключена')).toBeTruthy();
  expect(camera.stop).toHaveBeenCalledOnce();
 });

test('retry replaces the error with connecting and then live video', async () => {
  const camera = stream();
  media(vi.fn().mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError')).mockResolvedValueOnce(camera.value));
  const view = render(<Webcam />);
  fireEvent.click(screen.getByRole('button', { name: 'Включить камеру' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('Подключаем камеру…')).toBeTruthy();
  await waitFor(() => expect(view.container.querySelector('video')?.srcObject).toBe(camera.value));
  fireEvent.playing(view.container.querySelector('video')!);
  expect(screen.queryByText('Камера недоступна')).toBeNull();
  expect(screen.getByRole('button', { name: 'Выключить камеру' })).toBeTruthy();
});

test('settings resolution is saved and used when the camera is reopened',async()=>{
 const capture=media(vi.fn().mockResolvedValue(stream().value));
 const view=render(<Webcam showResolution/>);
 fireEvent.change(screen.getByLabelText('Разрешение'),{target:{value:'720'}});
 view.unmount();render(<Webcam showResolution/>);
 expect((screen.getByLabelText('Разрешение') as HTMLSelectElement).value).toBe('720');
 fireEvent.click(screen.getByRole('button',{name:'Включить камеру'}));
 await waitFor(()=>expect(capture).toHaveBeenCalledWith({audio:false,video:{width:{ideal:1280},height:{ideal:720}}}));
});
