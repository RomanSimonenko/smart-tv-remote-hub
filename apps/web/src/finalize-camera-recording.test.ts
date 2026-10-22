import {expect,test,vi} from 'vitest';
import {WebmFile} from '@fix-webm-duration/parser';
import {finalizeCameraRecording} from './finalize-camera-recording.js';

test('leaves MP4 untouched',async()=>{const blob=new Blob(['mp4'],{type:'video/mp4'});expect(await finalizeCameraRecording(blob,1000)).toBe(blob);});
test('rejects a WebM without duration instead of silently returning the original',async()=>{
 const read=vi.spyOn(WebmFile,'fromBlob').mockResolvedValue(new WebmFile(new Uint8Array()));
 try{await expect(finalizeCameraRecording(new Blob(['invalid'],{type:'video/webm'}),1000)).rejects.toThrow('WEBM_DURATION_MISSING');}
 finally{read.mockRestore();}
});
