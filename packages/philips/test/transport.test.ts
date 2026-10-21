import {EventEmitter} from 'node:events';
import {afterEach,expect,test,vi} from 'vitest';
const state=vi.hoisted(()=>({responses:[] as Array<{status:number;body:string;challenge?:string}>,sent:[] as any[],fingerprints:[] as string[],attempts:0}));
vi.mock('node:https',()=>({request:(options:any,receive:(res:any)=>void)=>{
 state.attempts++;const req=new EventEmitter() as any;
 req.destroy=(err:Error)=>{queueMicrotask(()=>{req.emit('error',err);req.emit('close');});};
 req.end=(body?:string)=>{state.sent.push({options,body});const value=state.responses.shift()!;const res=new EventEmitter() as any;res.statusCode=value.status;res.headers=value.challenge?{'www-authenticate':value.challenge}:{};receive(res);queueMicrotask(()=>{res.emit('data',Buffer.from(value.body));res.emit('end');req.emit('close');});};
 queueMicrotask(()=>{const socket=new EventEmitter() as any;socket.getPeerCertificate=()=>({fingerprint256:state.fingerprints.shift()??'aa'.repeat(32)});req.emit('socket',socket);socket.emit('secureConnect');});return req;
}}));
import {createPhilipsTransport} from '../src/transport.js';
afterEach(()=>{state.responses=[];state.sent=[];state.fingerprints=[];state.attempts=0;});
const signal=()=>new AbortController().signal;
test('certificate mismatch stops before request body or authorization is sent',async()=>{
 const t=createPhilipsTransport('192.168.1.5',1000);t.pin!('bb'.repeat(32));await expect(t.request('pair/grant',{pin:'0123'},signal(),{clientId:'synthetic',authKey:'synthetic'})).rejects.toMatchObject({code:'TV_CERTIFICATE_CHANGED'});expect(state.sent).toHaveLength(0);
});
test('Digest challenge retries a rejected request with the correct URI and no global TLS setting',async()=>{
 state.responses=[{status:401,body:'',challenge:'Digest realm="TV", nonce="synthetic", qop="auth", algorithm=MD5'},{status:200,body:'{"powerstate":"On"}'}];const t=createPhilipsTransport('192.168.1.5',1000);
 expect(await t.request('powerstate',undefined,signal(),{clientId:'synthetic',authKey:'synthetic'})).toEqual({powerstate:'On'});
 expect(state.sent).toHaveLength(2);expect(state.sent[0].options.headers.authorization).toBeUndefined();expect(state.sent[1].options.headers.authorization).toContain('uri="/6/powerstate"');expect(t.fingerprint()).toBe('aa'.repeat(32));
});
test('redirect is rejected without following a different origin',async()=>{state.responses=[{status:302,body:''}];const t=createPhilipsTransport('192.168.1.5',1000);await expect(t.request('system',undefined,signal())).rejects.toMatchObject({code:'INVALID_TV_RESPONSE'});expect(state.attempts).toBe(1);});
test('aborted request sends no network request',async()=>{const c=new AbortController();c.abort();await expect(createPhilipsTransport('192.168.1.5',1000).request('system',undefined,c.signal)).rejects.toThrow();expect(state.attempts).toBe(0);});

test('oversized success response is rejected rather than accepted as an empty response',async()=>{
 state.responses=[{status:200,body:'x'.repeat(128*1024+1)}];await expect(createPhilipsTransport('192.168.1.5',1000).request('system',undefined,signal())).rejects.toMatchObject({code:'INVALID_TV_RESPONSE'});
});
test('stale nonce permits only one fresh challenge response',async()=>{
 const challenge='Digest realm="TV", nonce="one", qop="auth"';state.responses=[{status:401,body:'',challenge},{status:401,body:'',challenge:'Digest realm="TV", nonce="two", qop="auth", stale=true'},{status:401,body:'',challenge:'Digest realm="TV", nonce="three", qop="auth", stale=true'}];await expect(createPhilipsTransport('192.168.1.5',1000).request('powerstate',undefined,signal(),{clientId:'synthetic',authKey:'synthetic'})).rejects.toMatchObject({code:'AUTHORIZATION_FAILED'});expect(state.attempts).toBe(3);expect(state.sent[2].options.headers.authorization).toContain('nonce="two"');
});

test('reused server nonce advances the client nonce-count across requests',async()=>{
 const challenge='Digest realm="TV", nonce="same", qop="auth"';state.responses=[{status:401,body:'',challenge},{status:200,body:'{}'},{status:401,body:'',challenge},{status:200,body:'{}'}];
 const t=createPhilipsTransport('192.168.1.5',1000),auth={clientId:'synthetic',authKey:'synthetic'};
 await t.request('powerstate',undefined,signal(),auth);await t.request('powerstate',undefined,signal(),auth);
 expect(state.sent[1].options.headers.authorization).toContain('nc=00000001');expect(state.sent[3].options.headers.authorization).toContain('nc=00000002');
});

test('fractional remaining operation budget reaches the network with an integer timeout',async()=>{
 state.responses=[{status:200,body:'{}'}];
 await expect(createPhilipsTransport('192.168.1.5',4999.5).request('system',undefined,signal())).resolves.toEqual({});
 expect(state.attempts).toBe(1);
});
