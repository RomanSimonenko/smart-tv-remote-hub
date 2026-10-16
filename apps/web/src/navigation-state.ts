import {tvIdSchema,tvPlatformSchema,type TvId,type TvPlatform} from '@remote-webos-tv/contracts';
export type Screen='dashboard'|'add'|'remote'|'profile'|'cases'|'editor'|'runs'|'runner'|'report';
export type NavigationState={screen:Exclude<Screen,'remote'|'editor'|'runner'|'report'>}|{screen:'remote';tvId:TvId;platform:TvPlatform}|{screen:'editor';caseId?:string}|{screen:'runner';caseId:string}|{screen:'report';runId:string};
/** History is per tab and survives reload. Invalid or foreign-owner entries start at the device list. */
export function readNavigation(owner:string):NavigationState{
 const saved=history.state?.appNavigation;
 if(!saved||saved.owner!==owner||!saved.route||typeof saved.route!=='object')return {screen:'dashboard'};
 const route=saved.route;
 if(['dashboard','add','profile','cases','runs'].includes(route.screen))return {screen:route.screen};
 if(route.screen==='runner'&&tvIdSchema.safeParse(route.caseId).success)return {screen:'runner',caseId:route.caseId};
 if(route.screen==='report'&&tvIdSchema.safeParse(route.runId).success)return {screen:'report',runId:route.runId};
 if(route.screen==='editor'&&(route.caseId===undefined||tvIdSchema.safeParse(route.caseId).success))return route.caseId?{screen:'editor',caseId:route.caseId}:{screen:'editor'};
 if(route.screen==='remote'&&tvIdSchema.safeParse(route.tvId).success&&tvPlatformSchema.safeParse(route.platform).success)return {screen:'remote',tvId:route.tvId,platform:route.platform};
 return {screen:'dashboard'};
}
export function writeNavigation(owner:string,route:NavigationState){
 const current=history.state;
 history.replaceState({...((current&&typeof current==='object'&&!Array.isArray(current))?current:{}),appNavigation:{owner,route}},'');
}
