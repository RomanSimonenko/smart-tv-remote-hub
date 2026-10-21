import {request as httpsRequest} from 'node:https';
import type {TLSSocket} from 'node:tls';
import {randomBytes} from 'node:crypto';
import {localTvHostSchema} from '@remote-webos-tv/contracts';
import {WebOsError} from '@remote-webos-tv/tv-adapter';
import {digestAuthorization,parseDigestChallenge} from './digest.js';
export interface PhilipsAuth {clientId:string;authKey:string}
export interface PhilipsTransport {
 request(path:string,body:unknown|undefined,signal:AbortSignal,auth?:PhilipsAuth):Promise<unknown>;
 fingerprint():string;
 pin?(fingerprint:string):void;
 close():void;
}
export function createPhilipsTransport(host:string,timeout:number):PhilipsTransport{
 host=localTvHostSchema.parse(host);
 let pinned='';const controllers=new Set<AbortController>();
 let digest:{key:string;cnonce:string;count:number}|undefined;
 const authorize=(header:string,method:string,uri:string,auth:PhilipsAuth)=>{
  const challenge=parseDigestChallenge(header);
  const key=JSON.stringify([auth.clientId,challenge.realm,challenge.nonce]);
  if(digest?.key!==key)digest={key,cnonce:randomBytes(16).toString('hex'),count:0};
  return digestAuthorization(header,method,uri,auth.clientId,auth.authKey,digest.cnonce,++digest.count);
 };
 const raw=(path:string,body:unknown|undefined,signal:AbortSignal,authorization?:string)=>new Promise<{status:number;body:string;challenge?:string}>((resolve,reject)=>{
  if(!/^[a-z]+(?:\/[a-z]+)*$/.test(path))return reject(new WebOsError('INVALID_TV_RESPONSE','Invalid protocol path'));
  const controller=new AbortController();controllers.add(controller);
  const combined=AbortSignal.any([signal,controller.signal,AbortSignal.timeout(Math.floor(timeout))]);
  const payload=body===undefined?undefined:JSON.stringify(body);
  const req=httpsRequest({host,port:1926,path:'/6/'+path,method:payload===undefined?'GET':'POST',agent:false,rejectUnauthorized:false,signal:combined,headers:{...(payload===undefined?{}:{'content-type':'application/json','content-length':Buffer.byteLength(payload)}),...(authorization?{authorization}:{})}},res=>{
   const chunks:Buffer[]=[];let bytes=0;
   res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>128*1024){const failure=new WebOsError('INVALID_TV_RESPONSE','TV response too large');reject(failure);req.destroy(failure);}else chunks.push(chunk);});
   res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode??0,body:Buffer.concat(chunks).toString('utf8'),...(res.headers['www-authenticate']?{challenge:res.headers['www-authenticate']}:{})}));
  });
  req.on('socket',socket=>(socket as TLSSocket).once('secureConnect',()=>{
   const fp=(socket as TLSSocket).getPeerCertificate().fingerprint256?.replaceAll(':','').toLowerCase();
   if(!fp||pinned&&fp!==pinned){req.destroy(new WebOsError('TV_CERTIFICATE_CHANGED','TV TLS fingerprint mismatch'));return;}
   pinned=fp;req.end(payload);
  }));
  req.once('error',reject);req.once('close',()=>controllers.delete(controller));
 });
 return {
  fingerprint:()=>pinned,
  pin(value){if(pinned&&pinned!==value)throw new WebOsError('TV_CERTIFICATE_CHANGED','TV TLS fingerprint mismatch');pinned=value;},
  close(){for(const c of controllers)c.abort();controllers.clear();},
  async request(path,body,signal,auth){
   signal.throwIfAborted();
   let r;
   try{
    r=await raw(path,body,signal);
    if(r.status===401&&auth&&r.challenge){
     r=await raw(path,body,signal,authorize(r.challenge,body===undefined?'GET':'POST','/6/'+path,auth));
     // A 401 stale response did not execute the operation. Allow one fresh challenge.
     if(r.status===401&&r.challenge&&/stale\s*=\s*"?true/i.test(r.challenge))r=await raw(path,body,signal,authorize(r.challenge,body===undefined?'GET':'POST','/6/'+path,auth));
    }
   }catch(cause){if(signal.aborted)throw signal.reason;if(cause instanceof WebOsError)throw cause;throw new WebOsError('NETWORK_UNREACHABLE','Philips request failed',{cause});}
   if(r.status===401||r.status===403)throw new WebOsError('AUTHORIZATION_FAILED','Philips authorization rejected');
   if(r.status!==200)throw new WebOsError('INVALID_TV_RESPONSE','Philips HTTP response rejected');
   try{return JSON.parse(r.body) as unknown;}catch{return r.body;}
  },
 };
}
