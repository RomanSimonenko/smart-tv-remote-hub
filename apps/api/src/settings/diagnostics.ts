import type Database from 'better-sqlite3';
import {access,readFile,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {diagnosticsSchema,type Diagnostics} from '@remote-webos-tv/contracts';
import type {OcrRecognizer} from '../ocr/recognizer.js';
import type {StorageSettingsService} from './service.js';

async function packageVersion(){
 let directory=dirname(fileURLToPath(import.meta.url));
 while(true){
  try{const pkg=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));if(pkg.name==='@remote-webos-tv/api'&&typeof pkg.version==='string')return pkg.version;}
  catch(cause){if(!(cause instanceof Error&&'code'in cause&&cause.code==='ENOENT'))throw cause;}
  const parent=dirname(directory);if(parent===directory)throw new Error('Application package metadata unavailable');directory=parent;
 }
}
export function createDiagnostics({sqlite,dataDir,ocr,storage,now=Date.now}:{sqlite:Database.Database;dataDir:string;ocr:OcrRecognizer;storage:StorageSettingsService;now?:()=>number}){
 const version=packageVersion();
 return async()=>{
  let database:'ok'|'error'='ok',disk:'ok'|'error'='ok',sqliteVersion='unknown',schemaVersion=0;
  try{
   sqliteVersion=(sqlite.prepare('SELECT sqlite_version() AS version').get() as {version:string}).version;
   schemaVersion=(sqlite.prepare('SELECT max(version) AS version FROM migration_version').get() as {version:number}).version;
   sqlite.prepare('SELECT count(*) FROM test_runs').get();
  }catch{database='error';}
  try{await access(dataDir,constants.R_OK|constants.W_OK);await readdir(dataDir);}catch{disk='error';}
  let cleanup:Diagnostics['cleanup'];
  try{cleanup=storage.cleanupState();}catch{database='error';cleanup={pendingFiles:null,lastAutomaticCheckAt:null,lastAutomaticError:null};}
  return diagnosticsSchema.parse({checkedAt:now(),applicationVersion:await version,nodeVersion:process.versions.node,sqliteVersion,schemaVersion,
   checks:{api:'ok',database,storage:disk},ocr:ocr.status?.()??{state:'unknown',engine:null,model:null},cleanup});
 };
}
