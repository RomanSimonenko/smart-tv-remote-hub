import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {Webcam} from './Webcam.js';

vi.mock('../finalize-camera-recording.js',()=>({finalizeCameraRecording:vi.fn(async(blob:Blob)=>blob)}));

class Recorder extends EventTarget{
 static instances:Recorder[]=[];
 static isTypeSupported=vi.fn((type:string)=>type==='video/webm');
 state:RecordingState='inactive';mimeType='video/webm';
 start=vi.fn(()=>{this.state='recording';});
 stop=vi.fn(()=>{this.state='inactive';});
 constructor(readonly stream:MediaStream){super();Recorder.instances.push(this);}
 data(value:string){this.dispatchEvent(Object.assign(new Event('dataavailable'),{data:new Blob([value],{type:this.mimeType})}));}
 finish(){this.dispatchEvent(new Event('stop'));}
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();Recorder.instances=[];Recorder.isTypeSupported.mockReset().mockImplementation(type=>type==='video/webm');});
function setup(){
 vi.stubGlobal('localStorage',{getItem:vi.fn().mockReturnValue(null),setItem:vi.fn()});
 const track={stop:vi.fn()},stream={getTracks:()=>[track],getVideoTracks:()=>[track]} as unknown as MediaStream;
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn().mockResolvedValue(stream),enumerateDevices:vi.fn().mockResolvedValue([{kind:'videoinput',deviceId:'other',label:'Synthetic camera'}])}});
 vi.stubGlobal('MediaRecorder',Recorder);
 const create=vi.fn().mockReturnValue('blob:synthetic-video'),revoke=vi.fn();
 vi.stubGlobal('URL',class extends URL{static createObjectURL=create;static revokeObjectURL=revoke;});
 const download=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 return{stream,track,create,revoke,download};
}
async function enable(view:ReturnType<typeof render>){
 fireEvent.click(screen.getByRole('button',{name:'Включить камеру'}));
 await waitFor(()=>expect(view.container.querySelector('video')?.srcObject).toBeTruthy());
 fireEvent.playing(view.container.querySelector('video')!);
}
test('records only on request, downloads final chunks and leaves the camera running',async()=>{
 const env=setup();const view=render(<Webcam recordingEnabled/>);
 expect((screen.getByRole('button',{name:'Записать видео'}) as HTMLButtonElement).disabled).toBe(true);
 await enable(view);expect(Recorder.instances).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));
 const recorder=Recorder.instances[0]!;expect(recorder.stream).toBe(env.stream);
 expect(screen.getByRole('timer').textContent).toBe('00:00');
 act(()=>recorder.data('first'));
 fireEvent.click(screen.getByRole('button',{name:'Остановить запись'}));
 expect(env.download).not.toHaveBeenCalled();
 await act(async()=>{recorder.data('last');recorder.finish();});
 expect(env.create.mock.calls[0]![0].size).toBe(9);
 expect(env.download).toHaveBeenCalledOnce();
 const link=screen.getByRole('link',{name:'Скачать запись'});
 expect(link.getAttribute('download')).toMatch(/^tv-camera-.*\.webm$/);
 expect(env.track.stop).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'Выключить камеру'})).toBeTruthy();
});
test.each(['stop','switch','unmount'])('finalizes recording once on camera lifecycle: %s',async(reason)=>{
 const env=setup();const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));const recorder=Recorder.instances[0]!;
 if(reason==='stop')fireEvent.click(screen.getByRole('button',{name:'Выключить камеру'}));
 else if(reason==='switch')fireEvent.change(screen.getByLabelText('Камера'),{target:{value:'other'}});
 else view.unmount();
 expect(recorder.stop).toHaveBeenCalledOnce();
 await act(async()=>{recorder.data('final');recorder.finish();});
 expect(env.download).toHaveBeenCalledOnce();
});
test('explains unsupported recording without disabling the camera',async()=>{
 setup();vi.stubGlobal('MediaRecorder',undefined);
 const view=render(<Webcam recordingEnabled/>);await enable(view);
 expect((screen.getByRole('button',{name:'Записать видео'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByText('Запись видео недоступна в этом браузере.')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Выключить камеру'})).toBeTruthy();
});
test('does not download an empty recording and reports the missing data',async()=>{
 const env=setup();const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));fireEvent.click(screen.getByRole('button',{name:'Остановить запись'}));
 act(()=>Recorder.instances[0]!.finish());
 expect(env.download).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('не содержит видеоданных');
});
test('recording controls are absent from ordinary runner cameras',()=>{
 setup();render(<Webcam/>);expect(screen.queryByRole('button',{name:'Записать видео'})).toBeNull();
});
test('reports encoder failure and downloads the available partial video',async()=>{
 const env=setup();const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));const recorder=Recorder.instances[0]!;
 await act(async()=>{recorder.dispatchEvent(Object.assign(new Event('error'),{error:new DOMException('Synthetic encoder failure','EncodingError')}));recorder.data('partial');recorder.finish();});
 expect(screen.getByRole('alert').textContent).toContain('EncodingError');
 expect(screen.getByRole('status').textContent).toContain('Доступная часть записи');
 expect(env.download).toHaveBeenCalledOnce();expect(recorder.stop).toHaveBeenCalledOnce();
});
test('rejects unsupported formats without changing the camera stream',async()=>{
 const env=setup();Recorder.isTypeSupported.mockReturnValue(false);
 const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));
 expect(screen.getByRole('alert').textContent).toContain('NotSupportedError');
 expect(env.track.stop).not.toHaveBeenCalled();expect(Recorder.instances).toHaveLength(0);
});
test('keeps the previous download available if the next recording cannot start',async()=>{
 setup();const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));fireEvent.click(screen.getByRole('button',{name:'Остановить запись'}));
 await act(async()=>{Recorder.instances[0]!.data('saved');Recorder.instances[0]!.finish();});
 Recorder.isTypeSupported.mockReturnValue(false);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));
 expect(screen.getByRole('link',{name:'Скачать запись'}).getAttribute('href')).toBe('blob:synthetic-video');
 expect(screen.getByRole('alert').textContent).toContain('NotSupportedError');
});
test('updates the timer deterministically and releases the file URL after leaving',async()=>{
 vi.useFakeTimers();const env=setup();const view=render(<Webcam recordingEnabled/>);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Включить камеру'}));});
 fireEvent.playing(view.container.querySelector('video')!);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));
 act(()=>vi.advanceTimersByTime(3000));expect(screen.getByRole('timer').textContent).toBe('00:03');
 const unload=new Event('beforeunload',{cancelable:true});fireEvent(window,unload);expect(unload.defaultPrevented).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Остановить запись'}));
 await act(async()=>{Recorder.instances[0]!.data('video');Recorder.instances[0]!.finish();});
 view.unmount();expect(env.revoke).not.toHaveBeenCalled();
 act(()=>vi.advanceTimersByTime(60000));expect(env.revoke).toHaveBeenCalledWith('blob:synthetic-video');
 expect(vi.getTimerCount()).toBe(0);
});

test('returning to a visible tab preserves the active recording',async()=>{
 setup();const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));
 const recorder=Recorder.instances[0]!;
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});fireEvent(document,new Event('visibilitychange'));
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});fireEvent(document,new Event('visibilitychange'));
 expect(recorder.stop).not.toHaveBeenCalled();
});
test('an empty replacement preserves the previous downloadable video',async()=>{
 setup();const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));fireEvent.click(screen.getByRole('button',{name:'Остановить запись'}));
 await act(async()=>{Recorder.instances[0]!.data('saved');Recorder.instances[0]!.finish();});
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));fireEvent.click(screen.getByRole('button',{name:'Остановить запись'}));
 await act(async()=>Recorder.instances[1]!.finish());
 expect(screen.getByRole('link',{name:'Скачать запись'})).toBeTruthy();
});

test('automatically stops at five minutes and reports the reason',async()=>{
 vi.useFakeTimers();setup();const onRecordingChange=vi.fn();const view=render(<Webcam recordingEnabled onRecordingChange={onRecordingChange}/>);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Включить камеру'}));});
 fireEvent.playing(view.container.querySelector('video')!);fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));
 expect(onRecordingChange).toHaveBeenLastCalledWith(true);
 act(()=>vi.advanceTimersByTime(300000));expect(Recorder.instances[0]!.stop).toHaveBeenCalledOnce();
 expect(screen.getByRole('status').textContent).toContain('5 минут');
 await act(async()=>{Recorder.instances[0]!.data('final');Recorder.instances[0]!.finish();});
 expect(onRecordingChange).toHaveBeenLastCalledWith(false);
});
test('stops when accumulated chunks reach the size limit',async()=>{
 setup();const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));const recorder=Recorder.instances[0]!;
 const chunk=new Blob(['chunk']);Object.defineProperty(chunk,'size',{value:128*1024*1024});
 act(()=>recorder.dispatchEvent(Object.assign(new Event('dataavailable'),{data:chunk})));
 expect(recorder.stop).toHaveBeenCalledOnce();expect(screen.getByRole('status').textContent).toContain('128 МБ');
 await act(async()=>recorder.finish());
});
test('metadata failure exposes the original file with a specific warning',async()=>{
 const {finalizeCameraRecording}=await import('../finalize-camera-recording.js');vi.mocked(finalizeCameraRecording).mockRejectedValueOnce(new Error('WEBM_DURATION_MISSING'));
 const env=setup();const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));fireEvent.click(screen.getByRole('button',{name:'Остановить запись'}));
 await act(async()=>{Recorder.instances[0]!.data('raw');Recorder.instances[0]!.finish();});
 expect(screen.getByRole('alert').textContent).toContain('метаданные');expect(screen.getByRole('link',{name:'Скачать запись'})).toBeTruthy();expect(env.download).toHaveBeenCalledOnce();
});

test('captures the TV model in a portable filename when recording starts',async()=>{
 setup();vi.spyOn(Date,'now').mockReturnValue(Date.UTC(2026,9,20,12,0,0));
 const view=render(<Webcam recordingEnabled recordingModel="Synthetic / TV"/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));
 view.rerender(<Webcam recordingEnabled recordingModel="Other TV"/>);
 fireEvent.click(screen.getByRole('button',{name:'Остановить запись'}));
 await act(async()=>{Recorder.instances[0]!.data('video');Recorder.instances[0]!.finish();});
 expect(screen.getByRole('link',{name:'Скачать запись'}).getAttribute('download')).toBe('Synthetic-TV-2026-10-20T12-00-00-000Z.webm');
});
test('cancel discards final chunks without downloading and preserves the previous file',async()=>{
 const env=setup();const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));fireEvent.click(screen.getByRole('button',{name:'Остановить запись'}));
 await act(async()=>{Recorder.instances[0]!.data('saved');Recorder.instances[0]!.finish();});
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));const recorder=Recorder.instances[1]!;
 act(()=>recorder.data('discard'));fireEvent.click(screen.getByRole('button',{name:'Отменить запись'}));
 await act(async()=>{recorder.data('final');recorder.finish();});
 expect(recorder.stop).toHaveBeenCalledOnce();expect(env.download).toHaveBeenCalledOnce();expect(env.create).toHaveBeenCalledOnce();
 expect(screen.getByRole('link',{name:'Скачать запись'})).toBeTruthy();expect(env.track.stop).not.toHaveBeenCalled();expect(screen.queryByRole('timer')).toBeNull();
});
test('cancel during metadata processing cannot create or download a file',async()=>{
 const {finalizeCameraRecording}=await import('../finalize-camera-recording.js');
 let resolve!:(blob:Blob)=>void;vi.mocked(finalizeCameraRecording).mockImplementationOnce(()=>new Promise<Blob>(done=>{resolve=done;}));
 const env=setup();const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));fireEvent.click(screen.getByRole('button',{name:'Остановить запись'}));
 act(()=>{Recorder.instances[0]!.data('video');Recorder.instances[0]!.finish();});
 fireEvent.click(screen.getByRole('button',{name:'Отменить запись'}));
 await act(async()=>resolve(new Blob(['video'])));
 expect(env.download).not.toHaveBeenCalled();expect(env.create).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Записать видео'})).toBeTruthy();
});
test('does not show recording limits below the camera buttons',()=>{
 setup();render(<Webcam recordingEnabled/>);expect(screen.queryByText(/до 5 минут или 128 МБ/)).toBeNull();
});

test('cancelling an empty recording does not report an empty-file error',async()=>{
 const env=setup();const view=render(<Webcam recordingEnabled/>);await enable(view);
 fireEvent.click(screen.getByRole('button',{name:'Записать видео'}));fireEvent.click(screen.getByRole('button',{name:'Отменить запись'}));
 await act(async()=>Recorder.instances[0]!.finish());
 expect(screen.queryByRole('alert')).toBeNull();expect(env.download).not.toHaveBeenCalled();expect(screen.getByRole('status').textContent).toBe('Запись отменена.');
});
