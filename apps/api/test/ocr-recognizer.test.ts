import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import type {ChildProcessWithoutNullStreams} from 'node:child_process';
import {afterEach,expect,test,vi} from 'vitest';
import {createOcrRecognizer} from '../src/ocr/recognizer.js';
import {spawn} from 'node:child_process';

vi.mock('node:child_process',async importOriginal=>{const actual=await importOriginal<typeof import('node:child_process')>();return {...actual,spawn:vi.fn(actual.spawn)};});

class Process extends EventEmitter {
 stdin=new PassThrough();stdout=new PassThrough();stderr=new PassThrough();killed=false;
 kill(){this.killed=true;queueMicrotask(()=>this.emit('close',null,'SIGKILL'));return true;}
 respond(value:unknown){this.stdout.write(JSON.stringify({id:1,phase:'base',result:value})+'\n'+JSON.stringify({id:1,phase:'result',result:value})+'\n');}
}
function setup(){const child=new Process();const recognizer=createOcrRecognizer({spawn:()=>child as unknown as ChildProcessWithoutNullStreams});return{child,recognizer};}
const result={blocks:[{text:'Мое кино'},{text:'Мои подписки'}],engine:'paddleocr-3.2.0',model:'PP-OCRv5_mobile_det+eslav_PP-OCRv5_mobile_rec'};
afterEach(()=>vi.useRealTimers());
test('returns validated local OCR blocks and sends original image through stdin',async()=>{
 const {child,recognizer}=setup();const chunks:Buffer[]=[];child.stdin.on('data',chunk=>chunks.push(chunk));
 const pending=recognizer.recognize(Buffer.from('synthetic JPEG'),new AbortController().signal);child.respond(result);
 expect(await pending).toEqual(result);expect(Buffer.concat(chunks).toString()).toBe('{"id":1,"imageBytes":14}\nsynthetic JPEG{"id":1,"retryIndices":[]}\n');await recognizer.close();
});
test('cancellation before start does not start a child',async()=>{
 let starts=0;const recognizer=createOcrRecognizer({spawn:()=>{starts++;return new Process() as unknown as ChildProcessWithoutNullStreams;}});
 const abort=new AbortController();abort.abort();await expect(recognizer.recognize(Buffer.from('x'),abort.signal)).rejects.toThrow('aborted');expect(starts).toBe(0);
});
test('cancellation kills active child and releases admission only after close',async()=>{
 const {child,recognizer}=setup();child.kill=()=>{child.killed=true;return true;};const abort=new AbortController();
 const pending=recognizer.recognize(Buffer.from('x'),abort.signal);const rejected=expect(pending).rejects.toThrow('aborted');abort.abort();
 expect(child.killed).toBe(true);await expect(recognizer.recognize(Buffer.from('y'),new AbortController().signal)).rejects.toThrow('busy');
 child.emit('close',null,'SIGKILL');await rejected;await recognizer.close();
});
test.each([{}, {blocks:[{text:1}],engine:'paddle',model:'model'}, {...result,blocks:[{text:'x'.repeat(10001)}]}])('rejects malformed worker output %#',async value=>{
 const {child,recognizer}=setup();const pending=recognizer.recognize(Buffer.from('x'),new AbortController().signal);child.respond(value);await expect(pending).rejects.toThrow('invalid response');
});
test('rejects output above 1 MiB and kills worker',async()=>{
 const {child,recognizer}=setup();const pending=recognizer.recognize(Buffer.from('x'),new AbortController().signal);child.stdout.write(Buffer.alloc(1024*1024+1));
 await expect(pending).rejects.toThrow('response exceeds limit');expect(child.killed).toBe(true);
});
test('reports worker crash without exposing stderr or recognized text',async()=>{
 const {child,recognizer}=setup();const pending=recognizer.recognize(Buffer.from('x'),new AbortController().signal);child.stderr.write('sensitive OCR text');child.emit('close',1,null);
 await expect(pending).rejects.toThrow('OCR process failed (exit 1)');
});
test('technical timeout terminates worker and does not retry',async()=>{
 vi.useFakeTimers();const {child,recognizer}=setup();const pending=recognizer.recognize(Buffer.from('x'),new AbortController().signal);const rejected=expect(pending).rejects.toThrow('OCR timed out');
 await vi.advanceTimersByTimeAsync(30_000);await rejected;expect(child.killed).toBe(true);
});
test('close aborts active OCR, waits for process exit, and rejects future work',async()=>{
 const {child,recognizer}=setup();child.kill=()=>{child.killed=true;return true;};const pending=recognizer.recognize(Buffer.from('x'),new AbortController().signal);const rejected=expect(pending).rejects.toThrow('OCR closed');
 let closed=false;const closing=recognizer.close().then(()=>{closed=true;});expect(child.killed).toBe(true);await Promise.resolve();expect(closed).toBe(false);
 child.emit('close',null,'SIGKILL');await rejected;await closing;await expect(recognizer.recognize(Buffer.from('x'),new AbortController().signal)).rejects.toThrow('OCR closed');
});
test('starts the packaged Python Paddle worker with local model configuration',async()=>{
 const start=vi.mocked(spawn);
 start.mockImplementation(()=>{throw new Error('probe');});
 const recognizer=createOcrRecognizer();
 await expect(recognizer.recognize(Buffer.from('x'),new AbortController().signal)).rejects.toThrow('could not start');
 expect(start).toHaveBeenCalledWith(expect.any(String),expect.arrayContaining([expect.stringContaining('worker.py')]),expect.objectContaining({stdio:'pipe'}));
 start.mockReset();
});

test('requests only missing whitespace candidates, deduplicates and limits regions',async()=>{
 const {child,recognizer}=setup();const input:Buffer[]=[];child.stdin.on('data',chunk=>input.push(chunk));
 const blocks=['Историяпросмотров','Настройки','A B','C D','E F','G H'].map(text=>({text}));
 const base={...result,blocks};
 const pending=recognizer.recognize(Buffer.from('image'),new AbortController().signal,['История просмотров','Настройки','Истори япросмотров','AB','CD','EF','GH','Отсутствует']);
 child.stdout.write(JSON.stringify({id:1,phase:'base',result:base})+'\n');
 expect(Buffer.concat(input).toString()).toBe('{"id":1,"imageBytes":5}\nimage{"id":1,"retryIndices":[0,2,3]}\n');
 child.stdout.write(JSON.stringify({id:1,phase:'result',result:{...base,blocks:[...blocks,{text:'История просмотров'}]}})+'\n');
 expect((await pending).blocks).toContainEqual({text:'История просмотров'});await recognizer.close();
});
test('rejects final output that discards original OCR evidence',async()=>{
 const {child,recognizer}=setup();const pending=recognizer.recognize(Buffer.from('image'),new AbortController().signal);
 child.stdout.write(JSON.stringify({id:1,phase:'base',result})+'\n');child.stdout.write(JSON.stringify({id:1,phase:'result',result:{...result,blocks:[]}})+'\n');
 await expect(pending).rejects.toThrow('invalid response');
});

test('handles fragmented protocol frames and rejects unsolicited retry evidence',async()=>{
 const {child,recognizer}=setup();const pending=recognizer.recognize(Buffer.from('image'),new AbortController().signal);
 const base=JSON.stringify({id:1,phase:'base',result})+'\n';child.stdout.write(base.slice(0,17));child.stdout.write(base.slice(17));
 child.stdout.write(JSON.stringify({id:1,phase:'result',result:{...result,blocks:[...result.blocks,{text:'unsolicited'}]}})+'\n');
 await expect(pending).rejects.toThrow('invalid response');
});
test('cancellation during line retry kills the same worker and never accepts late output',async()=>{
 const {child,recognizer}=setup();const abort=new AbortController();
 const pending=recognizer.recognize(Buffer.from('image'),abort.signal,['Мо е кино']);
 const rejected=expect(pending).rejects.toThrow('aborted');child.stdout.write(JSON.stringify({id:1,phase:'base',result})+'\n');abort.abort();
 child.respond(result);await rejected;expect(child.killed).toBe(true);
});

test('base and line retry share one technical timeout',async()=>{
 vi.useFakeTimers();const {child,recognizer}=setup();const pending=recognizer.recognize(Buffer.from('image'),new AbortController().signal,['Мо е кино']);
 const rejected=expect(pending).rejects.toThrow('OCR timed out');await vi.advanceTimersByTimeAsync(20_000);
 child.stdout.write(JSON.stringify({id:1,phase:'base',result})+'\n');expect(child.killed).toBe(false);
 await vi.advanceTimersByTimeAsync(10_000);await rejected;expect(child.killed).toBe(true);
});

test('successful requests reuse one live worker with distinct job IDs',async()=>{
 const children:Process[]=[];const recognizer=createOcrRecognizer({spawn:()=>{const child=new Process();children.push(child);return child as unknown as ChildProcessWithoutNullStreams;}});
 const first=recognizer.recognize(Buffer.from('first'),new AbortController().signal);
 children[0]!.stdout.write(JSON.stringify({id:1,phase:'base',result})+'\n'+JSON.stringify({id:1,phase:'result',result})+'\n');
 expect(await first).toEqual(result);expect(children[0]!.killed).toBe(false);
 const second=recognizer.recognize(Buffer.from('second'),new AbortController().signal);
 expect(children).toHaveLength(1);
 children[0]!.stdout.write(JSON.stringify({id:2,phase:'base',result})+'\n'+JSON.stringify({id:2,phase:'result',result})+'\n');
 expect(await second).toEqual(result);await recognizer.close();expect(children[0]!.killed).toBe(true);
});

test('aborted worker is replaced only after exit and the next job can succeed',async()=>{
 const children:Process[]=[];const recognizer=createOcrRecognizer({spawn:()=>{const child=new Process();children.push(child);return child as unknown as ChildProcessWithoutNullStreams;}});
 const abort=new AbortController(),first=recognizer.recognize(Buffer.from('first'),abort.signal),rejected=expect(first).rejects.toThrow('aborted');
 abort.abort();await rejected;
 const second=recognizer.recognize(Buffer.from('second'),new AbortController().signal);expect(children).toHaveLength(2);
 children[1]!.stdout.write(JSON.stringify({id:2,phase:'base',result})+'\n'+JSON.stringify({id:2,phase:'result',result})+'\n');
 expect(await second).toEqual(result);await recognizer.close();
});
test('idle crash is observed and the next request starts a fresh process',async()=>{
 const children:Process[]=[];const recognizer=createOcrRecognizer({spawn:()=>{const child=new Process();children.push(child);return child as unknown as ChildProcessWithoutNullStreams;}});
 const first=recognizer.recognize(Buffer.from('first'),new AbortController().signal);children[0]!.respond(result);await first;
 children[0]!.emit('close',1,null);
 const second=recognizer.recognize(Buffer.from('second'),new AbortController().signal);expect(children).toHaveLength(2);
 children[1]!.stdout.write(JSON.stringify({id:2,phase:'base',result})+'\n'+JSON.stringify({id:2,phase:'result',result})+'\n');await second;await recognizer.close();
});
test('a stale job ID cannot become the next image result',async()=>{
 const {child,recognizer}=setup();const first=recognizer.recognize(Buffer.from('first'),new AbortController().signal);child.respond(result);await first;
 const second=recognizer.recognize(Buffer.from('second'),new AbortController().signal);child.respond(result);
 await expect(second).rejects.toThrow('invalid response');expect(child.killed).toBe(true);await recognizer.close();
});
test('each warm job has its own 30 second timeout',async()=>{
 vi.useFakeTimers();const {child,recognizer}=setup();
 const first=recognizer.recognize(Buffer.from('first'),new AbortController().signal);await vi.advanceTimersByTimeAsync(20_000);child.respond(result);await first;
 await vi.advanceTimersByTimeAsync(60_000);expect(child.killed).toBe(false);
 const second=recognizer.recognize(Buffer.from('second'),new AbortController().signal),rejected=expect(second).rejects.toThrow('timed out');
 await vi.advanceTimersByTimeAsync(29_999);expect(child.killed).toBe(false);await vi.advanceTimersByTimeAsync(1);await rejected;await recognizer.close();
});
test('unsolicited idle output poisons the worker and admission stays busy until exit',async()=>{
 const {child,recognizer}=setup();const first=recognizer.recognize(Buffer.from('first'),new AbortController().signal);child.respond(result);await first;
 child.kill=()=>{child.killed=true;return true;};child.stdout.write('unexpected');expect(child.killed).toBe(true);
 await expect(recognizer.recognize(Buffer.from('second'),new AbortController().signal)).rejects.toThrow('busy');
 child.emit('close',null,'SIGKILL');await recognizer.close();
});

test('preloads the worker with a synthetic inference and reuses it for the first image',async()=>{
 vi.useFakeTimers();const {child,recognizer}=setup();const input:Buffer[]=[];child.stdin.on('data',chunk=>input.push(chunk));
 const warming=recognizer.warmup();
 expect(Buffer.concat(input).toString()).toBe('{"id":1,"warmup":true}\n');
 await expect(recognizer.recognize(Buffer.from('image'),new AbortController().signal)).rejects.toThrow('busy');
 await vi.advanceTimersByTimeAsync(30_000);expect(child.killed).toBe(false);
 child.respond({...result,blocks:[]});await warming;
 const pending=recognizer.recognize(Buffer.from('image'),new AbortController().signal);
 child.stdout.write(JSON.stringify({id:2,phase:'base',result})+'\n'+JSON.stringify({id:2,phase:'result',result})+'\n');
 expect(await pending).toEqual(result);await recognizer.close();
});
test('warmup timeout terminates the worker and reports failure',async()=>{
 vi.useFakeTimers();const {child,recognizer}=setup();const warming=recognizer.warmup();const rejected=expect(warming).rejects.toThrow('timed out');
 await vi.advanceTimersByTimeAsync(120_000);await rejected;expect(child.killed).toBe(true);await recognizer.close();
});
