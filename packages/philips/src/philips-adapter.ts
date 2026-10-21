import {randomBytes} from 'node:crypto';
import {localTvHostSchema,type TvButton,type TvCapabilities,type TvIdentity} from '@remote-webos-tv/contracts';
import {WebOsError,TvButtonSendError,type TvAdapter,type PairingRequest} from '@remote-webos-tv/tv-adapter';
import {createPhilipsTransport,type PhilipsTransport,type PhilipsAuth} from './transport.js';
import {metadata,object,pairingSignature,pairingSuccess} from './protocol.js';
const capabilities:TvCapabilities={ssap:false,buttons:true,pointer:false,powerOff:false,wakeOnLan:false,apps:false,inputs:false,textInput:false,notifications:false};
const keys:Partial<Record<TvButton,string>>={UP:'CursorUp',DOWN:'CursorDown',LEFT:'CursorLeft',RIGHT:'CursorRight',ENTER:'Confirm',HOME:'Home',BACK:'Back',MENU:'Options',VOLUME_UP:'VolumeUp',VOLUME_DOWN:'VolumeDown',MUTE:'Mute',CHANNEL_UP:'ChannelStepUp',CHANNEL_DOWN:'ChannelStepDown',RED:'RedColour',GREEN:'GreenColour',YELLOW:'YellowColour',BLUE:'BlueColour',PAUSE:'Pause',STOP:'Stop',REWIND:'Rewind',FAST_FORWARD:'FastForward',...Object.fromEntries(Array.from({length:10},(_,i)=>[String(i),'Digit'+i]))};
interface Credential extends PhilipsAuth{version:1;certificateFingerprint:string}
function credential(raw:string):Credential{
 try{const c=JSON.parse(raw) as Credential;if(c.version!==1||typeof c.clientId!=='string'||!c.clientId||typeof c.authKey!=='string'||!c.authKey||!/^[a-f0-9]{64}$/.test(c.certificateFingerprint))throw Error();return c;}
 catch{throw new WebOsError('KEY_STORE_CORRUPT','Invalid Philips credential');}
}
export interface PhilipsOptions{host:string;requestTimeoutMs:number;allowPairingPrompt:boolean;now?:()=>number;newId?:()=>string;transport?:PhilipsTransport}
export function createPhilipsAdapter(options:PhilipsOptions):TvAdapter{
 const host=localTvHostSchema.parse(options.host),transport=options.transport??createPhilipsTransport(host,options.requestTimeoutMs);
 const now=options.now??Date.now;
 let auth:Credential|undefined,identity:TvIdentity={model:'Philips Whale'},closed=false;
 const requireAuth=()=>{if(closed||!auth)throw new WebOsError('AUTHORIZATION_FAILED','Philips not paired');return auth;};
 const readPower=async(signal:AbortSignal)=>{const state=object(await transport.request('powerstate',undefined,signal,requireAuth()));if(state.powerstate!=='On'&&state.powerstate!=='Standby')throw new WebOsError('INVALID_TV_RESPONSE','Invalid Philips power state');return state.powerstate;};
 return {
  async pair(request:PairingRequest){
   request.signal.throwIfAborted();if(closed||request.host!==host)throw new WebOsError('AUTHORIZATION_FAILED','Philips pairing host mismatch');
   auth=undefined;
   try{
    let candidate:Credential;
    if(request.credential){candidate=credential(request.credential);transport.pin?.(candidate.certificateFingerprint);}
    else{
     if(!options.allowPairingPrompt||!request.requestPin)throw new WebOsError('AUTHORIZATION_FAILED','Philips PIN required');
     const device={device_name:'RemoteWebOSTV',device_os:'Linux',app_name:'RemoteWebOSTV',type:'native',app_id:'remotewebostv',id:(options.newId??(()=>randomBytes(8).toString('hex')))()};
     const challenge=object(await transport.request('pair/request',{scope:['read','write','control'],device},request.signal));pairingSuccess(challenge);
     if(typeof challenge.auth_key!=='string'||!challenge.auth_key||!Number.isSafeInteger(challenge.timestamp)||typeof challenge.timeout!=='number'||!Number.isFinite(challenge.timeout)||challenge.timeout<=0||challenge.timeout>300)throw new WebOsError('INVALID_TV_RESPONSE','Invalid Philips pairing response');
     const expiresAt=now()+challenge.timeout*1000;
     const pin=await request.requestPin({expiresAt});request.signal.throwIfAborted();
     if(now()>=expiresAt)throw new WebOsError('PAIRING_TIMEOUT','Philips PIN expired');
     if(!/^[0-9]{4}$/.test(pin))throw new WebOsError('INVALID_PIN','Invalid PIN format');
     candidate={version:1,clientId:device.id,authKey:challenge.auth_key,certificateFingerprint:transport.fingerprint()};
     const response=object(await transport.request('pair/grant',{auth:{auth_AppId:'1',pin,auth_timestamp:challenge.timestamp,auth_signature:pairingSignature(String(challenge.timestamp),pin)},device},request.signal,candidate));pairingSuccess(response);
    }
    request.signal.throwIfAborted();auth=candidate;
    const system=object(await transport.request('system',undefined,request.signal,auth));
    const version=object(system.api_version);if(version.Major!==6)throw new WebOsError('UNSUPPORTED_CAPABILITY','Unsupported Philips API');
    const model=metadata(system,'model'),firmware=metadata(system,'softwareversion');
    identity={model:model??'Philips Whale',...(firmware?{firmwareVersion:firmware}:{})};
    await readPower(request.signal);request.signal.throwIfAborted();
    return {credential:JSON.stringify(candidate),identity,capabilities,transport:'https:1926',macAddresses:[]};
   }catch(cause){auth=undefined;throw cause;}
  },
  async readSnapshot(signal){const power=await readPower(signal);return {connection:power==='On'?'available':'unavailable',identity,capabilities,transport:'https:1926'};},
  async prepareRemote(signal){signal.throwIfAborted();requireAuth();},
  async sendButton(button,signal){
   const authorization=requireAuth(),key=keys[button];signal.throwIfAborted();
   if(!key)throw new WebOsError('UNSUPPORTED_CAPABILITY','Unsupported Philips key');
   try{const response=await transport.request('input/key',{key},signal,authorization);if(response!==''&&response!=='<html><head><title>Ok</title></head><body>Ok</body></html>')throw new WebOsError('INVALID_TV_RESPONSE','Unexpected Philips key response');}
   catch(cause){throw new TvButtonSendError(cause instanceof WebOsError?cause.code:'CONNECTION_LOST','unknown','Philips key outcome not confirmed',{cause});}
  },
  async disconnect(){closed=true;auth=undefined;transport.close();},
 };
}
