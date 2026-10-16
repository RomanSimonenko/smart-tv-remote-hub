import type Database from 'better-sqlite3';
import {testRunSchema,testRunSummarySchema,type TestRun} from '@remote-webos-tv/contracts';
export const testRunsTableSql=`CREATE TABLE test_runs (
 id TEXT PRIMARY KEY NOT NULL,
 started_at INTEGER NOT NULL,
 revision INTEGER NOT NULL,
 document TEXT NOT NULL
)`;
export class RunConflictError extends Error {readonly statusCode=409;readonly code='RUN_CONFLICT';}
export interface RunHistoryFilters {query?:string;status?:TestRun['status'];tvId?:string;since?:number;until?:number}
export function createTestRunRepository(sqlite:Database.Database){
 sqlite.function('run_casefold',{deterministic:true},value=>typeof value==='string'?value.toLocaleLowerCase('ru'):'');
 const read=(id:string):TestRun|undefined=>{const row=sqlite.prepare('SELECT document FROM test_runs WHERE id=?').get(id) as {document:string}|undefined;return row?testRunSchema.parse(JSON.parse(row.document)):undefined;};
 return {
  read,
  create(run:TestRun){const parsed=testRunSchema.parse(run);sqlite.prepare('INSERT INTO test_runs VALUES (?,?,?,?)').run(parsed.id,parsed.startedAt,parsed.revision,JSON.stringify(parsed));return read(parsed.id)!;},
  replace(run:TestRun,expected:number){const parsed=testRunSchema.parse({...run,revision:expected+1});const result=sqlite.prepare('UPDATE test_runs SET revision=?,document=? WHERE id=? AND revision=?').run(parsed.revision,JSON.stringify(parsed),parsed.id,expected);if(result.changes!==1)throw new RunConflictError('Запуск изменён другим запросом');return parsed;},
  list(limit=25,before?:{time:number;id:string},filters:RunHistoryFilters={}){
   const conditions:string[]=[],values:(string|number)[]=[];
   if(before){conditions.push('(started_at<? OR (started_at=? AND id<?))');values.push(before.time,before.time,before.id);}
   if(filters.query){conditions.push("instr(run_casefold(json_extract(document,'$.testCase.title')),?)>0");values.push(filters.query.toLocaleLowerCase('ru'));}
   if(filters.status){conditions.push("json_extract(document,'$.status')=?");values.push(filters.status);}
   if(filters.tvId){conditions.push("json_extract(document,'$.tvId')=?");values.push(filters.tvId);}
   if(filters.since!==undefined){conditions.push('started_at>=?');values.push(filters.since);}
   if(filters.until!==undefined){conditions.push('started_at<=?');values.push(filters.until);}
   // Project summaries inside SQLite; large evidence documents never enter the
   // history page's JS heap just to be discarded during serialization.
   const rows=sqlite.prepare(`SELECT id, started_at AS startedAt, revision,
    json_extract(document,'$.testCase.id') AS caseId, json_extract(document,'$.testCase.title') AS caseTitle,
    json_extract(document,'$.testCase.version') AS caseVersion, json_extract(document,'$.tvId') AS tvId,
    json_extract(document,'$.tvPlatformVersion') AS tvPlatformVersion, json_extract(document,'$.platform') AS platform, json_extract(document,'$.tvName') AS tvName,
    json_extract(document,'$.status') AS status, json_extract(document,'$.endedAt') AS endedAt,
    json_extract(document,'$.failure') AS failure_json, coalesce(json_extract(document,'$.settling'),0) AS settling,
    json_array_length(document,'$.items') AS itemCount,
    (SELECT count(*) FROM json_each(test_runs.document,'$.items') WHERE json_extract(value,'$.phase')='saved') AS savedCount
    FROM test_runs ${conditions.length?`WHERE ${conditions.join(' AND ')}`:''} ORDER BY started_at DESC,id DESC LIMIT ?`).all(...values,limit+1) as Record<string,unknown>[];
   const runs=rows.slice(0,limit).map(row=>{const {endedAt,failure_json,settling,tvPlatformVersion,...rest}=row;return testRunSummarySchema.parse({...rest,...(tvPlatformVersion===null?{}:{tvPlatformVersion}),settling:!!settling,...(endedAt===null?{}:{endedAt}),...(failure_json===null?{}:{failure:JSON.parse(failure_json as string)})});});const last=runs.at(-1);
   return {runs,next:rows.length>limit&&last?`${last.startedAt}:${last.id}`:null};
  },
  all():TestRun[]{return (sqlite.prepare('SELECT document FROM test_runs').all() as {document:string}[]).map(row=>testRunSchema.parse(JSON.parse(row.document)));},
 };
}
export type TestRunRepository=ReturnType<typeof createTestRunRepository>;
