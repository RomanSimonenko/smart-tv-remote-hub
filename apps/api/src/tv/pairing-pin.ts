import {TvServiceError} from './operation.js';
import type {TvScheduler} from './service.js';
export function waitForPairingPin(signal:AbortSignal,delay:number,scheduler:TvScheduler,onClear:()=>void,onExpire:()=>void){
 let settle:((value:string)=>void)|undefined,reject!: (cause:unknown)=>void;
 const promise=new Promise<string>((yes,no)=>{settle=yes;reject=no;});
 let timer:unknown;
 const cleanup=()=>{settle=undefined;scheduler.clearTimeout(timer);signal.removeEventListener('abort',abort);onClear();};
 const abort=()=>{cleanup();reject(signal.reason);};
 timer=scheduler.setTimeout(()=>{cleanup();reject(new TvServiceError('PIN_EXPIRED',409));onExpire();},delay);
 signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 return {promise,submit(pin:string){const resolve=settle;if(!resolve)throw new TvServiceError('PIN_NOT_WAITING',409);cleanup();resolve(pin);}};
}
