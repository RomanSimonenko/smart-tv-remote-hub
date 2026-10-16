import {test,expect} from 'vitest';
import {recognizeText,withOcrWorker} from './ocr.js';
test('ocr_failure_is_explicit',async()=>{
 await expect(recognizeText('missing.png',{x:0,y:0,width:1,height:1},'rus',new AbortController().signal)).rejects.toThrow();
});
test('worker_is_released_on_abort',async()=>{
 let released=false;const controller=new AbortController();
 const worker={terminate:async()=>{released=true;}};
 const started=Promise.withResolvers<void>();
 const operation=withOcrWorker(async()=>worker,async()=>{started.resolve();return new Promise<void>(()=>{});},controller.signal);
 await started.promise;controller.abort();
 await expect(operation).rejects.toThrow();expect(released).toBe(true);
});
test('worker_is_released_on_error',async()=>{
 let released=false;
 await expect(withOcrWorker(async()=>({terminate:async()=>{released=true;}}),async()=>{throw new Error('broken');},new AbortController().signal)).rejects.toThrow('broken');
 expect(released).toBe(true);
});
test('late_worker_is_released_when_initialization_aborted',async()=>{
 let released=false;const controller=new AbortController(),ready=Promise.withResolvers<{terminate:()=>Promise<void>}>();
 const operation=withOcrWorker(()=>ready.promise,async()=>true,controller.signal);
 controller.abort();ready.resolve({terminate:async()=>{released=true;}});
 await expect(operation).rejects.toThrow();expect(released).toBe(true);
});
test('real_ocr_recognizes_russian_and_returns_frame_coordinates',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {generateFixtures}=await import('./fixtures.js');const dir=await mkdtemp(join(tmpdir(),'ocr-real-'));
 try{
  await generateFixtures(dir);
  const result=await recognizeText(join(dir,'russian-clear.png'),{x:0.025,y:0.1,width:0.95,height:0.5},'rus',AbortSignal.timeout(15000));
  expect(result.text).toContain('Программа передач');expect(result.words.length).toBeGreaterThan(0);
  expect(result.words[0]!.box.x).toBeGreaterThanOrEqual(40);expect(result.words[0]!.box.y).toBeGreaterThan(80);
 }finally{await rm(dir,{recursive:true});}
},20000);
