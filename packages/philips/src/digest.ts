import {createHash} from 'node:crypto';
import {WebOsError} from '@remote-webos-tv/tv-adapter';
const md5=(s:string)=>createHash('md5').update(s).digest('hex');
export function parseDigestChallenge(header:string):{realm:string;nonce:string;qop?:string;opaque?:string}{
 const fail=()=>new WebOsError('INVALID_TV_RESPONSE','Invalid Digest challenge');
 if(!/^Digest\s/i.test(header))throw fail();
 const fields:Record<string,string>={};
 for(const m of header.slice(7).matchAll(/([a-z_]+)\s*=\s*(?:"([^"\r\n]*)"|([^,\s]+))/gi))fields[m[1]!.toLowerCase()]=m[2]??m[3]!;
 if(!fields.realm||!fields.nonce||fields.algorithm&&fields.algorithm.toUpperCase()!=='MD5'||fields.qop&&!fields.qop.split(',').map(x=>x.trim()).includes('auth'))throw fail();
 return {realm:fields.realm,nonce:fields.nonce,...(fields.qop?{qop:fields.qop}:{}),...(fields.opaque?{opaque:fields.opaque}:{})};
}
export function digestAuthorization(header:string,method:string,uri:string,user:string,password:string,cnonce:string,count:number):string{
 const fields=parseDigestChallenge(header);
 const quote=(s:string)=>'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
 const nc=count.toString(16).padStart(8,'0');
 const ha1=md5(`${user}:${fields.realm}:${password}`),ha2=md5(`${method}:${uri}`);
 const response=fields.qop?md5(`${ha1}:${fields.nonce}:${nc}:${cnonce}:auth:${ha2}`):md5(`${ha1}:${fields.nonce}:${ha2}`);
 return 'Digest '+Object.entries({username:user,realm:fields.realm,nonce:fields.nonce,uri,response,...(fields.opaque?{opaque:fields.opaque}:{})}).map(([k,v])=>`${k}=${quote(v)}`).join(', ')+(fields.qop?`, qop=auth, nc=${nc}, cnonce=${quote(cnonce)}`:'');
}
