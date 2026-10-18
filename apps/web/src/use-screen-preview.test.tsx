import {test,expect,vi,afterEach} from 'vitest';
import {renderHook,act,waitFor,cleanup} from '@testing-library/react';
import {api} from './api.js';import {useScreenPreview} from './use-screen-preview.js';
import type {CameraPreview} from '@remote-webos-tv/contracts';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test('screen preview is sequential and cancels pending work when returning to source',async()=>{
 let callback:VideoFrameRequestCallback|undefined,complete!:(value:CameraPreview)=>void;
 const request=vi.fn((next:VideoFrameRequestCallback)=>{callback=next;return 7;}),cancel=vi.fn();
 const video={current:{videoWidth:1920,videoHeight:1080,requestVideoFrameCallback:request,cancelVideoFrameCallback:cancel} as unknown as HTMLVideoElement};
 vi.spyOn(api,'session').mockResolvedValue({username:'qa',csrfToken:'a'.repeat(43)});
 const preview=vi.spyOn(api,'cameraPreview').mockReturnValue(new Promise(resolve=>{complete=resolve;}));
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(done=>done(new Blob(['synthetic'])));
 const view=renderHook(({active})=>useScreenPreview(video,active),{initialProps:{active:true}});
 await waitFor(()=>expect(callback).toBeDefined());
 await act(async()=>{const next=callback!;callback=undefined;next(performance.now(),{} as VideoFrameCallbackMetadata);});
 expect(preview).toHaveBeenCalledOnce();expect(callback).toBeUndefined();
 const signal=preview.mock.calls[0]![3];expect(signal.aborted).toBe(false);
 view.rerender({active:false});expect(signal.aborted).toBe(true);
 await act(async()=>complete({status:'found',image:'late',prior:{corners:[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.7},{x:.2,y:.7}],polarity:[1,1,1,1]}}));
 expect(request).toHaveBeenCalledOnce();expect(view.result.current.image).toBe('');expect(view.result.current.getSearchPrior()).toBeUndefined();
});

test('screen preview confirms three fresh frames and hides the result immediately on loss',async()=>{
 let callback:VideoFrameRequestCallback|undefined,now=100;
 vi.spyOn(performance,'now').mockImplementation(()=>now);
 const video={current:{videoWidth:1920,videoHeight:1080,requestVideoFrameCallback:(next:VideoFrameRequestCallback)=>{callback=next;return 1;},cancelVideoFrameCallback:vi.fn()} as unknown as HTMLVideoElement};
 vi.spyOn(api,'session').mockResolvedValue({username:'qa',csrfToken:'a'.repeat(43)});
 const found:CameraPreview={status:'found',image:'synthetic',prior:{corners:[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.7},{x:.2,y:.7}],polarity:[1,1,1,1]}};
 const preview=vi.spyOn(api,'cameraPreview').mockResolvedValueOnce(found).mockResolvedValueOnce(found).mockResolvedValueOnce(found).mockResolvedValue({status:'not-found'});
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(done=>done(new Blob(['synthetic'])));
 const view=renderHook(()=>useScreenPreview(video,true));
 for(let i=0;i<3;i++){
  await waitFor(()=>expect(callback).toBeDefined());now+=100;
  await act(async()=>{const next=callback!;callback=undefined;next(now,{} as VideoFrameCallbackMetadata);});
  expect(preview).toHaveBeenCalledTimes(i+1);if(i<2)expect(view.result.current.getSearchPrior()).toBeUndefined();
 }
 expect(view.result.current.image).toBe('data:image/png;base64,synthetic');
 expect(view.result.current.getSearchPrior()).toEqual(found.prior);
 now+=1001;expect(view.result.current.getSearchPrior()).toEqual(found.prior);now-=1001;
 await act(async()=>{callback!(now,{} as VideoFrameCallbackMetadata);});
 expect(preview).toHaveBeenCalledTimes(3);
 await act(async()=>{now+=100;callback!(now,{} as VideoFrameCallbackMetadata);});
 expect(view.result.current.image).toBe('');expect(view.result.current.message).toBe('Экран не найден');expect(view.result.current.getSearchPrior()).toEqual(found.prior);
});
test('processing delay hides stale pixels but preserves search identity and recovers on the next fresh frame',async()=>{
 let callback:VideoFrameRequestCallback|undefined,now=0;
 vi.spyOn(performance,'now').mockImplementation(()=>now);
 const video={current:{videoWidth:1920,videoHeight:1080,requestVideoFrameCallback:(next:VideoFrameRequestCallback)=>{callback=next;return 1;},cancelVideoFrameCallback:vi.fn()} as unknown as HTMLVideoElement};
 vi.spyOn(api,'session').mockResolvedValue({username:'qa',csrfToken:'a'.repeat(43)});
 const found:CameraPreview={status:'found',image:'synthetic',prior:{corners:[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.7},{x:.2,y:.7}],polarity:[1,1,1,1]}};
 const preview=vi.spyOn(api,'cameraPreview').mockResolvedValue(found);
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(done=>done(new Blob(['synthetic'])));
 const view=renderHook(({active})=>useScreenPreview(video,active),{initialProps:{active:true}});
 await waitFor(()=>expect(callback).toBeDefined());
 const next=async()=>{await act(async()=>{now+=100;callback!(now,{} as VideoFrameCallbackMetadata);});};
 await next();await next();await next();expect(view.result.current.image).not.toBe('');
 expect(view.result.current.getSearchPrior()).toEqual(found.prior);
 preview.mockImplementationOnce(async()=>{now+=1500;return found;});await next();
 expect(view.result.current.image).toBe('');expect(view.result.current.message).toBe('Обновляем изображение…');expect(view.result.current.getSearchPrior()).toEqual(found.prior);
 await next();expect(view.result.current.image).not.toBe('');
 preview.mockResolvedValueOnce({status:'not-found'});await next();expect(view.result.current.image).toBe('');expect(view.result.current.message).toBe('Экран не найден');
 view.rerender({active:false});expect(view.result.current.getSearchPrior()).toBeUndefined();
});
