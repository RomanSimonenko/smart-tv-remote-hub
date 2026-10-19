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
 respond(value:unknown){this.stdout.end(JSON.stringify({phase:'base',result:value})+'\n'+JSON.stringify({phase:'result',result:value})+'\n');this.emit('close',0,null);}
}
function setup(){const child=new Process();const recognizer=createOcrRecognizer({spawn:()=>child as unknown as ChildProcessWithoutNullStreams});return{child,recognizer};}
const result={blocks:[{text:'Мое кино'},{text:'Мои подписки'}],engine:'paddleocr-3.2.0',model:'PP-OCRv5_mobile_det+eslav_PP-OCRv5_mobile_rec'};
afterEach(()=>vi.useRealTimers());
test('returns validated local OCR blocks and sends original image through stdin',async()=>{
 const {child,recognizer}=setup();const chunks:Buffer[]=[];child.stdin.on('data',chunk=>chunks.push(chunk));
 const pending=recognizer.recognize(Buffer.from('synthetic JPEG'),new AbortController().signal);child.respond(result);
 expect(await pending).toEqual(result);expect(Buffer.concat(chunks).toString()).toBe('{"imageBytes":14}\nsynthetic JPEG{"retryIndices":[]}\n');await recognizer.close();
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
 child.stdout.write(JSON.stringify({phase:'base',result:base})+'\n');
 expect(Buffer.concat(input).toString()).toBe('{"imageBytes":5}\nimage{"retryIndices":[0,2,3]}\n');
 child.stdout.end(JSON.stringify({phase:'result',result:{...base,blocks:[...blocks,{text:'История просмотров'}]}})+'\n');child.emit('close',0,null);
 expect((await pending).blocks).toContainEqual({text:'История просмотров'});await recognizer.close();
});
test('rejects final output that discards original OCR evidence',async()=>{
 const {child,recognizer}=setup();const pending=recognizer.recognize(Buffer.from('image'),new AbortController().signal);
 child.stdout.write(JSON.stringify({phase:'base',result})+'\n');child.stdout.end(JSON.stringify({phase:'result',result:{...result,blocks:[]}})+'\n');child.emit('close',0,null);
 await expect(pending).rejects.toThrow('invalid response');
});

test('handles fragmented protocol frames and rejects unsolicited retry evidence',async()=>{
 const {child,recognizer}=setup();const pending=recognizer.recognize(Buffer.from('image'),new AbortController().signal);
 const base=JSON.stringify({phase:'base',result})+'\n';child.stdout.write(base.slice(0,17));child.stdout.write(base.slice(17));
 child.stdout.end(JSON.stringify({phase:'result',result:{...result,blocks:[...result.blocks,{text:'unsolicited'}]}})+'\n');child.emit('close',0,null);
 await expect(pending).rejects.toThrow('invalid response');
});
test('cancellation during line retry kills the same worker and never accepts late output',async()=>{
 const {child,recognizer}=setup();const abort=new AbortController();
 const pending=recognizer.recognize(Buffer.from('image'),abort.signal,['Мо е кино']);
 const rejected=expect(pending).rejects.toThrow('aborted');child.stdout.write(JSON.stringify({phase:'base',result})+'\n');abort.abort();
 child.respond(result);await rejected;expect(child.killed).toBe(true);
});

test('base and line retry share one technical timeout',async()=>{
 vi.useFakeTimers();const {child,recognizer}=setup();const pending=recognizer.recognize(Buffer.from('image'),new AbortController().signal,['Мо е кино']);
 const rejected=expect(pending).rejects.toThrow('OCR timed out');await vi.advanceTimersByTimeAsync(20_000);
 child.stdout.write(JSON.stringify({phase:'base',result})+'\n');expect(child.killed).toBe(false);
 await vi.advanceTimersByTimeAsync(10_000);await rejected;expect(child.killed).toBe(true);
});
