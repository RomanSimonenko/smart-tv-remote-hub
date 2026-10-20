import {expect,test} from 'vitest';
import {createPhilipsAdapter} from '../src/philips-adapter.js';
import {metadata,pairingSignature} from '../src/protocol.js';
import {digestAuthorization} from '../src/digest.js';
const caps={ssap:false,buttons:true,pointer:false,powerOff:false,wakeOnLan:false,apps:false,inputs:false,textInput:false,notifications:false};
test('RFC Digest example signs the actual method and URI',()=>{
 const value=digestAuthorization('Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"','GET','/dir/index.html','Mufasa','Circle Of Life','0a4f113b',1);
 expect(value).toContain('response="6629fae49393a05397450978507c4ef1"');expect(value).toContain('nc=00000001');
});
test('pairing signature encodes raw HMAC rather than hex',()=>expect(pairingSignature('123','0123')).toBe('79+x3MPwBbmeMCDh1/kLX6MHrDw='));
function fixture(error?:string){
 const calls:Array<{path:string;body:any}>=[];
 const a=createPhilipsAdapter({host:'192.168.1.5',requestTimeoutMs:5000,allowPairingPrompt:true,now:()=>1000,newId:()=> 'synthetic-client',transport:{fingerprint:()=> 'aa'.repeat(32),close(){},async request(path,body){calls.push({path,body});if(path==='pair/request')return {error_id:'SUCCESS',timestamp:42,timeout:30,auth_key:'synthetic-key'};if(path==='pair/grant')return {error_id:error??'SUCCESS'};if(path==='system')return {model:'Synthetic Philips',api_version:{Major:6,Minor:1,Patch:0}};if(path==='powerstate')return {powerstate:'On'};return '<html><head><title>Ok</title></head><body>Ok</body></html>';}}});return {a,calls};
}
test('pair and reconnect preserve credentials and a single RIGHT command',async()=>{
 const {a,calls}=fixture();const signal=new AbortController().signal;
 const result=await a.pair({host:'192.168.1.5',signal,requestPin:async challenge=>{expect(challenge.expiresAt).toBe(31000);return '0123';}});
 expect(result.capabilities).toEqual(caps);expect(JSON.parse(result.credential).authKey).toBe('synthetic-key');
 await a.sendButton('RIGHT',signal);expect(calls.filter(x=>x.path==='input/key')).toEqual([{path:'input/key',body:{key:'CursorRight'}}]);
 const before=calls.filter(x=>x.path==='pair/request').length;
 await a.pair({host:'192.168.1.5',signal,credential:result.credential,requestPin:async()=>{throw Error('must not prompt');}});
 expect(calls.filter(x=>x.path==='pair/request')).toHaveLength(before);
});
test.each(['INVALID_PIN','TIMEOUT','CONCURRENT_PAIRING'])('HTTP success carrying %s does not authorize TV',async error=>{
 const {a}=fixture(error);await expect(a.pair({host:'192.168.1.5',signal:new AbortController().signal,requestPin:async()=> '0123'})).rejects.toThrow();
 await expect(a.sendButton('RIGHT',new AbortController().signal)).rejects.toThrow();
});
test('cancelled PIN cannot send grant',async()=>{
 const {a,calls}=fixture();const c=new AbortController();await expect(a.pair({host:'192.168.1.5',signal:c.signal,requestPin:async()=>{c.abort();return '0123';}})).rejects.toThrow();expect(calls.some(x=>x.path==='pair/grant')).toBe(false);
});

test('encrypted model uses IV prefix and rejects corrupted metadata',()=>{expect(metadata({model_encrypted:'AQEBAQEBAQEBAQEBAQEBARZ7JrXb4hjlFYbdHYCsphk/5RqOFm3FV/Ve8AeZIz/J'},'model')).toBe('Synthetic Philips');expect(()=>metadata({model_encrypted:'invalid'},'model')).toThrow();});
