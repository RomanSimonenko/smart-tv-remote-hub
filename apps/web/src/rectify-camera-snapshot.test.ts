import {test,expect,vi,afterEach} from 'vitest';
import {api} from './api.js';
import {rectifyCameraSnapshot} from './rectify-camera-snapshot.js';
import type {CameraPrior} from '@remote-webos-tv/contracts';
afterEach(()=>vi.restoreAllMocks());
const prior:CameraPrior={corners:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}],polarity:[1,1,1,1]};
const raw={blob:new Blob(['source'],{type:'image/png'}),capturedAt:123,cameraLabel:'Synthetic camera'};
test('rectifies the fresh camera frame and preserves its capture metadata',async()=>{
 vi.spyOn(api,'session').mockResolvedValue({username:'qa',csrfToken:'a'.repeat(43)});
 const process=vi.spyOn(api,'cameraSnapshot').mockResolvedValue({status:'found',image:btoa('jpeg-result'),prior});
 const signal=new AbortController().signal;
 const result=await rectifyCameraSnapshot(raw,prior,signal);
 expect(result.capturedAt).toBe(123);expect(result.cameraLabel).toBe(raw.cameraLabel);expect(result.blob.type).toBe('image/jpeg');expect(result.blob.size).toBe(11);
 expect(process.mock.calls[0]![0]).toBe(raw.blob);expect(process.mock.calls[0]![2]).toEqual(prior);
});
test('missing confirmation and a lost screen fail closed without raw fallback',async()=>{
 const session=vi.spyOn(api,'session').mockResolvedValue({username:'qa',csrfToken:'a'.repeat(43)});
 await expect(rectifyCameraSnapshot(raw,undefined,new AbortController().signal)).rejects.toMatchObject({code:'SCREEN_NOT_FOUND'});expect(session).not.toHaveBeenCalled();
 vi.spyOn(api,'cameraSnapshot').mockResolvedValue({status:'not-found'});
 await expect(rectifyCameraSnapshot(raw,prior,new AbortController().signal)).rejects.toMatchObject({code:'SCREEN_NOT_FOUND'});
});
test('cancellation discards a late processed image',async()=>{
 vi.spyOn(api,'session').mockResolvedValue({username:'qa',csrfToken:'a'.repeat(43)});
 let complete!:(value:{status:'found';image:string;prior:CameraPrior})=>void;
 const process=vi.spyOn(api,'cameraSnapshot').mockReturnValue(new Promise(resolve=>{complete=resolve;}));
 const controller=new AbortController(),pending=rectifyCameraSnapshot(raw,prior,controller.signal);
 await vi.waitFor(()=>expect(process).toHaveBeenCalledOnce());controller.abort();
 complete({status:'found',image:btoa('late-image'),prior});
 await expect(pending).rejects.toMatchObject({name:'AbortError'});
});
