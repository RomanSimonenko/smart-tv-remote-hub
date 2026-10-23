import type Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {lstat,readdir,statfs} from 'node:fs/promises';
import {join} from 'node:path';
import {storagePolicySchema,retentionSelectionSchema,cleanupCandidateSchema,type StoragePolicy,type CleanupPreview} from '@remote-webos-tv/contracts';
import type {ArtifactStore} from '../test-runs/artifacts.js';

export class SettingsError extends Error {
 constructor(readonly code:string,readonly statusCode=409){super(code);}
}
const dayMs=86_400_000;
const defaults:StoragePolicy={automatic:false,days:30,keepUnsuccessful:true};
type Preview={owner:string;value:CleanupPreview;result?:{deleted:number;pendingFiles:number}};

export function createStorageSettingsService({sqlite,artifacts,dataDir,now=Date.now}:{sqlite:Database.Database;artifacts:ArtifactStore;dataDir:string;now?:()=>number}){
 const previews=new Map<string,Preview>();let serial=Promise.resolve();
 let lastAutomaticCheckAt:number|null=null,lastAutomaticError=false;
 const pendingFiles=()=>Number((sqlite.prepare('SELECT count(*) AS n FROM deleted_test_runs WHERE pending_files=1').get() as {n:number}).n);
 const policy=():StoragePolicy=>{
  const row=sqlite.prepare('SELECT document FROM storage_settings WHERE id=1').get() as {document:string}|undefined;
  return row?storagePolicySchema.parse(JSON.parse(row.document)):{...defaults};
 };
 function exclusive<T>(action:()=>Promise<T>):Promise<T>{
  const result=serial.then(action);serial=result.then(()=>{},()=>{});return result;
 }
 function candidates(selection:unknown){
  const {days,keepUnsuccessful}=retentionSelectionSchema.parse(selection);
  const rows=sqlite.prepare(`SELECT id,revision,json_extract(document,'$.testCase.title') AS title,
   json_extract(document,'$.endedAt') AS endedAt,length(CAST(document AS BLOB)) AS reportBytes,
   (SELECT count(*) FROM json_each(test_runs.document,'$.items') WHERE json_extract(value,'$.phase')='saved') AS snapshots,
   coalesce((SELECT sum(json_extract(value,'$.bytes')) FROM json_each(test_runs.document,'$.items') WHERE json_extract(value,'$.phase')='saved'),0) AS snapshotBytes
   FROM test_runs WHERE json_extract(document,'$.status')!='running'
   AND coalesce(json_extract(document,'$.settling'),0)=0
   AND json_extract(document,'$.endedAt')<?
   ${keepUnsuccessful?"AND json_extract(document,'$.status')='passed'":''}
   ORDER BY json_extract(document,'$.endedAt'),id LIMIT 501`).all(now()-days*dayMs);
  return {rows:rows.slice(0,500).map(row=>cleanupCandidateSchema.parse(row)),truncated:rows.length>500};
 }
 function preview(owner:string,selection:unknown):CleanupPreview{
  for(const [token,p]of previews)if(p.value.expiresAt<=now()||p.owner===owner)previews.delete(token);
  if(previews.size>=100)throw new SettingsError('RATE_LIMITED',429);
  const {rows,truncated}=candidates(selection),value={token:randomUUID(),expiresAt:now()+10*60_000,candidates:rows,truncated,
   snapshotBytes:rows.reduce((sum,r)=>sum+r.snapshotBytes,0),reportBytes:rows.reduce((sum,r)=>sum+r.reportBytes,0)};
  previews.set(value.token,{owner,value});return value;
 }
 async function drain(){
  const rows=sqlite.prepare('SELECT id FROM deleted_test_runs WHERE pending_files=1').all() as {id:string}[];
  const failures:unknown[]=[];
  for(const row of rows){try{await artifacts.removeRun(row.id);sqlite.prepare('UPDATE deleted_test_runs SET pending_files=0 WHERE id=?').run(row.id);}catch(cause){failures.push(cause);}}
  return {pending:pendingFiles(),failures};
 }
 function remove(rows:CleanupPreview['candidates']){
  sqlite.transaction(()=>{
   // Validate the entire confirmed set before deleting any metadata.
   for(const row of rows){
    const current=sqlite.prepare(`SELECT revision,json_extract(document,'$.status') AS status,coalesce(json_extract(document,'$.settling'),0) AS settling FROM test_runs WHERE id=?`).get(row.id) as {revision:number;status:string;settling:number}|undefined;
    if(!current||current.revision!==row.revision||current.status==='running'||current.settling)throw new SettingsError('CLEANUP_PREVIEW_STALE');
   }
   for(const row of rows){sqlite.prepare('INSERT INTO deleted_test_runs VALUES (?,1)').run(row.id);sqlite.prepare('DELETE FROM test_runs WHERE id=?').run(row.id);}
  }).immediate();
 }
 async function confirm(owner:string,token:string,confirmed:boolean){
  if(confirmed!==true)throw new SettingsError('BAD_REQUEST',400);
  return exclusive(async()=>{
   const p=previews.get(token);if(!p||p.owner!==owner||p.value.expiresAt<=now())throw new SettingsError('CLEANUP_PREVIEW_EXPIRED');
   if(p.result)return {...p.result,pendingFiles:pendingFiles()};
   remove(p.value.candidates);
   // Commit the receipt before any awaited work, so retries cannot delete twice.
   p.result={deleted:p.value.candidates.length,pendingFiles:pendingFiles()};
   const result=await drain();p.result.pendingFiles=result.pending;return p.result;
  });
 }
 async function sweep(){return exclusive(async()=>{
  lastAutomaticCheckAt=now();lastAutomaticError=false;
  try{
   const saved=policy();if(saved.automatic)remove(candidates({days:saved.days,keepUnsuccessful:saved.keepUnsuccessful}).rows);
   const result=await drain();if(result.failures.length)throw new AggregateError(result.failures,'Cleanup file deletion failed');
  }catch(cause){lastAutomaticError=true;throw cause;}
 });}
 async function diskUsage(){
  const totals={databaseBytes:0,backupBytes:0,otherBytes:0,totalBytes:0,snapshotCount:0};
  async function walk(path:string,category:'databaseBytes'|'backupBytes'|'otherBytes'|'snapshots'){
   for(const entry of await readdir(path,{withFileTypes:true})){
    const target=join(path,entry.name);if(entry.isDirectory()){await walk(target,category);continue;}
    const stat=await lstat(target);totals.totalBytes+=stat.size;
    if(category==='snapshots'){if(entry.name.endsWith('.jpg'))totals.snapshotCount++;}
    else totals[category]+=stat.size;
   }
  }
  for(const entry of await readdir(dataDir,{withFileTypes:true})){
   const category=entry.name==='run-artifacts'?'snapshots':entry.name==='backups'?'backupBytes':/^app\.sqlite(?:-(?:wal|shm))?$/.test(entry.name)?'databaseBytes':'otherBytes';
   const target=join(dataDir,entry.name);if(entry.isDirectory())await walk(target,category);
   else{const stat=await lstat(target);totals.totalBytes+=stat.size;totals[category==='snapshots'?'otherBytes':category]+=stat.size;}
  }
  return totals;
 }
 async function summary(){
  const totals=await diskUsage(),fs=await statfs(dataDir),usage=artifacts.usage();
  const reports=sqlite.prepare('SELECT count(*) AS count,coalesce(sum(length(CAST(document AS BLOB))),0) AS bytes FROM test_runs').get() as {count:number;bytes:number};
  return {policy:policy(),databaseBytes:totals.databaseBytes,backupBytes:totals.backupBytes,otherBytes:totals.otherBytes,totalBytes:totals.totalBytes,
   freeBytes:fs.bavail*fs.bsize,reports,snapshots:{...usage,count:totals.snapshotCount},pendingFiles:pendingFiles()};
 }
 return {policy,preview,confirm,sweep,summary,
  savePolicy(input:unknown){const value=storagePolicySchema.parse(input);sqlite.prepare('INSERT INTO storage_settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document').run(JSON.stringify(value));return value;},
  forget(owner:string){for(const [key,p]of previews)if(p.owner===owner)previews.delete(key);},
  cleanupState:()=>({pendingFiles:pendingFiles(),lastAutomaticCheckAt,lastAutomaticError}),
  async close(){await serial;previews.clear();},
 };
}
export type StorageSettingsService=ReturnType<typeof createStorageSettingsService>;
