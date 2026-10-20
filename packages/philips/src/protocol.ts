import {createDecipheriv,createHmac} from 'node:crypto';
import {WebOsError} from '@remote-webos-tv/tv-adapter';
// Shared protocol material published by jointSPACE clients; not a device credential.
const sharedKey=Buffer.from('ZmVay1EQVFOaZhwQ4Kv81ypLAZNczV9sG4KkseXWn1NEk6cXmPKO/MCa9sryslvLCFMnNe4Z4CPXzToowvhHvA==','base64');
export const pairingSignature=(timestamp:string,pin:string)=>createHmac('sha1',sharedKey).update(timestamp+pin,'utf8').digest('base64');
export function object(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new WebOsError('INVALID_TV_RESPONSE','Expected TV JSON object');return value as Record<string,unknown>;
}
export function metadata(data:Record<string,unknown>,field:string):string|undefined{
 const plain=data[field];if(typeof plain==='string'&&plain.trim())return plain.trim();
 const encrypted=data[field+'_encrypted'];if(encrypted===undefined||encrypted==='')return undefined;
 try{
  if(typeof encrypted!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted))throw Error();
  const raw=Buffer.from(encrypted,'base64');if(raw.length<32||raw.length%16!==0)throw Error();
  const decipher=createDecipheriv('aes-128-cbc',sharedKey.subarray(0,16),raw.subarray(0,16));
  const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat([decipher.update(raw.subarray(16)),decipher.final()])).trim();
  if(!text)throw Error();return text;
 }catch{throw new WebOsError('INVALID_TV_RESPONSE','Invalid encrypted TV metadata');}
}
export function pairingSuccess(data:Record<string,unknown>):void{
 if(data.error_id==='SUCCESS')return;
 const code=data.error_id==='INVALID_PIN'?'INVALID_PIN':data.error_id==='TIMEOUT'?'PAIRING_TIMEOUT':data.error_id==='CONCURRENT_PAIRING'?'PAIRING_BUSY':'PAIRING_REJECTED';
 throw new WebOsError(code,'Philips pairing rejected');
}
