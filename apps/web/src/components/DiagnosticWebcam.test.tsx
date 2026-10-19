import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {useImperativeHandle,useEffect} from 'react';
import {api} from '../api.js';
import {DiagnosticWebcam} from './DiagnosticWebcam.js';
const capture=vi.hoisted(()=>vi.fn(async()=>({blob:new Blob(['image'],{type:'image/jpeg'}),capturedAt:0,cameraLabel:'synthetic'})));
vi.mock('./Webcam.js',()=>({Webcam:({ref,onReadyChange,footer}:any)=>{useImperativeHandle(ref,()=>({capture}));useEffect(()=>{onReadyChange(true);},[]);return <div>Синтетическая камера{footer}</div>;}}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test('one action captures a fresh snapshot on each recognition and displays text beside it',async()=>{
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:synthetic'),revokeObjectURL:vi.fn()}));
 const recognize=vi.spyOn(api,'diagnoseOcr').mockResolvedValue({blocks:[{text:'Мои подписки'}],engine:'synthetic',model:'mobile',elapsedMs:1234});
 render(<DiagnosticWebcam csrfToken="synthetic" onSessionExpired={()=>{}}/>);
 const panel=screen.getByText('Проверить распознавание').closest('details')!;panel.open=true;fireEvent(panel,new Event('toggle'));
 expect(screen.queryByRole('button',{name:'Сделать снимок'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Распознать текст'}));
 await screen.findByText('Мои подписки');
 expect(screen.getByText('Мои подписки').closest('.camera-check-results')).not.toBeNull();
 expect(screen.getByText(/Распознавание: 1,23 с/)).toBeTruthy();
 expect(recognize).toHaveBeenCalledTimes(1);expect(recognize.mock.calls[0]![0]).toBeInstanceOf(Blob);
 const before=capture.mock.calls.length;fireEvent.click(screen.getByRole('button',{name:'Распознать текст'}));await screen.findByText('Мои подписки');expect(capture.mock.calls.length).toBe(before+1);expect(recognize).toHaveBeenCalledTimes(2);
});

test('closing diagnostics aborts recognition and discards the probe',async()=>{
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:synthetic'),revokeObjectURL:vi.fn()}));
 let signal:AbortSignal|undefined;
 vi.spyOn(api,'diagnoseOcr').mockImplementation((_blob,_csrf,abort)=>{signal=abort;return new Promise(()=>{});});
 render(<DiagnosticWebcam csrfToken="synthetic" onSessionExpired={()=>{}}/>);
 const panel=screen.getByText('Проверить распознавание').closest('details')!;panel.open=true;fireEvent(panel,new Event('toggle'));
 fireEvent.click(screen.getByRole('button',{name:'Распознать текст'}));await screen.findByAltText('Проверочный снимок');expect(signal).toBeDefined();expect(screen.queryByRole('status')).toBeNull();expect(screen.queryByText('Распознаём текст…')).toBeNull();expect(screen.getByRole('button',{name:'Распознавание…'})).toBeTruthy();
 panel.open=false;fireEvent(panel,new Event('toggle'));expect(signal!.aborted).toBe(true);
 expect(screen.queryByAltText('Проверочный снимок')).toBeNull();
});

test('capture failure does not send an old image to OCR',async()=>{
 capture.mockRejectedValueOnce(new Error('camera unavailable'));
 const recognize=vi.spyOn(api,'diagnoseOcr');
 render(<DiagnosticWebcam csrfToken="synthetic" onSessionExpired={()=>{}}/>);
 const panel=screen.getByText('Проверить распознавание').closest('details')!;panel.open=true;fireEvent(panel,new Event('toggle'));
 fireEvent.click(screen.getByRole('button',{name:'Распознать текст'}));
 await screen.findByRole('alert');expect(recognize).not.toHaveBeenCalled();expect(screen.queryByAltText('Проверочный снимок')).toBeNull();
});
