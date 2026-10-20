import {createPhilipsAdapter} from '@remote-webos-tv/philips';
import {createOcrRecognizer,type OcrRecognizer} from './ocr/recognizer.js';
import { createTestCaseRepository } from './test-cases/repository.js';
import {createTestRunRepository} from './test-runs/repository.js';
import {createArtifactStore} from './test-runs/artifacts.js';
import {createTestRunService,type TestRunService} from './test-runs/service.js';
import { createProfileRepository } from './profile/repository.js';
import { buildApp } from './app.js';
import type { AppConfig } from './config.js';
import type { FastifyInstance } from 'fastify';
import type { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Writable } from 'node:stream';
import { Lgtv2Adapter, loadClientKeyCipher } from '@remote-webos-tv/webos';
import { createSamsungAdapter } from '@remote-webos-tv/tizen';
import { createOwnerRepository } from './auth/repository.js';
import { createOwnerSetupService } from './auth/service.js';
import { createAuthSessionService, loadAuthMasterKey } from './auth/sessions.js';
import { openDatabase } from './storage/database.js';
import { safeCauseTypes, safeListenTextResolver } from './security/logging.js';
import { createTvDeviceRepository } from './tv/repository.js';
import { createTvDeviceRegistry, type TvDeviceRegistry } from './tv/device-registry.js';
import { createTvService, type TvService, type TvServiceDependencies, type TvScheduler, type TvVersionDiagnostic } from './tv/service.js';

const runtimeScheduler: TvScheduler = {
  now: () => performance.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export async function createApiRuntime(config: AppConfig, options: {
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
  readonly webRoot?: string;
  readonly createAdapter?: TvServiceDependencies['createAdapter'];
  readonly scheduler?: TvScheduler;
  readonly newId?: () => string;
  readonly openDatabase?: typeof openDatabase;
  readonly logStream?: Writable;
  readonly ocrRecognizer?: OcrRecognizer;
  readonly warmOcr?: boolean;
} = {}) {
  const database = await (options.openDatabase ?? openDatabase)({ dataDir: config.dataDir });
  let tv: TvService | undefined;
  let testRunService:TestRunService|undefined;
  const ocr=options.ocrRecognizer??createOcrRecognizer();
  let tvs: TvDeviceRegistry | undefined;
  let unsubscribeRegistry: (() => void) | undefined;
  let logger: FastifyInstance['log'] | undefined;
  const pendingVersionDiagnostics: TvVersionDiagnostic[] = [];
  const logVersionDiagnostic = (diagnostic: TvVersionDiagnostic) => {
    if (!logger) { pendingVersionDiagnostics.push(diagnostic); return; }
    logger.warn({ code: 'TV_OPTIONAL_METADATA_UNAVAILABLE', operation: diagnostic.operation, diagnosticCode: diagnostic.code }, 'Optional TV metadata unavailable');
  };
  const closeResources = async () => {
    const failures: unknown[] = [];
    unsubscribeRegistry?.();
    try {await testRunService?.close();}catch(cause){failures.push(cause);}
    try {await ocr.close();}catch(cause){failures.push(cause);}
    try { await tvs?.close(); } catch (cause) { failures.push(cause); }
    try { database.close(); } catch (cause) { failures.push(cause); }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'API resource cleanup failed');
  };
  try {
    const repository = createOwnerRepository(database.sqlite);
    const masterKey = await loadAuthMasterKey(config.dataDir, () => repository.hasSessions(), options.randomBytes);
    const sessions = await createAuthSessionService({ repository, masterKey, ...options });
    const tvRepository = createTvDeviceRepository(database.sqlite);
    // Initialize exactly one cipher before exposing HTTP, even with no saved TV.
    const cipher = await loadClientKeyCipher({ directory: config.dataDir, hasStoredKey: tvRepository.list().length > 0 });
    const now = options.now ?? Date.now;
    tvs = createTvDeviceRegistry({ repository: tvRepository, scheduler: options.scheduler ?? runtimeScheduler, newId: randomUUID,
      createService: (repository, onOperationFinished, platform) => createTvService({
      repository, platform, cipher, now, newId: options.newId ?? randomUUID, onOperationFinished,
      scheduler: options.scheduler ?? runtimeScheduler,
      recoveryTimeoutMs: config.recoveryTimeoutMs ?? 60_000,
      onVersionDiagnostic: logVersionDiagnostic,
      createAdapter: options.createAdapter ?? ((host, keyStore, requestTimeoutMs, allowPairingPrompt, platform = 'webos') => platform === 'whale' ? createPhilipsAdapter({host,requestTimeoutMs,allowPairingPrompt,now}) : platform === 'tizen' ? createSamsungAdapter({
        host, requestTimeoutMs, handshakeTimeoutMs: requestTimeoutMs, allowPairingPrompt,
        scheduler: options.scheduler ?? runtimeScheduler,
      }) : new Lgtv2Adapter({
        host, keyStore, requestTimeoutMs, handshakeTimeoutMs: requestTimeoutMs, allowPairingPrompt, now: () => new Date(now()),
        ...(config.wolBroadcastAddress === undefined ? {} : { wolBroadcastAddress: config.wolBroadcastAddress }),
      })),
    }) });
    unsubscribeRegistry = sessions.onRevoke((owner) => tvs!.revoke(owner, !sessions.hasActiveSessions()));
    await tvs.initialize();
    tv = tvs.legacy();
    const testCases=createTestCaseRepository(database.sqlite,{now});
    const artifacts=await createArtifactStore({dataDir:config.dataDir,...(config.runArtifactMaxBytes===undefined?{}:{maxBytes:config.runArtifactMaxBytes})});
    testRunService=createTestRunService({recognize:(image,signal,expected)=>ocr.recognize(image,signal,expected),repository:createTestRunRepository(database.sqlite),artifacts,readCase:testCases.read,resolveTv:id=>tvs!.get(id),now,scheduler:options.scheduler??runtimeScheduler,onPersistenceFailure:code=>{if(logger)logger.error({code},'Run lifecycle state could not be persisted; execution was aborted');else console.error(code);}});
    await testRunService.recover();
    const app = buildApp({
      ocr,
      config,
      tv,
      tvs,
      ...(options.logStream ? { logStream: options.logStream } : {}),
      ...(options.webRoot ? { webRoot: options.webRoot } : {}),
      profile: createProfileRepository(database.sqlite),
      testCases,
      testRuns:{service:testRunService,artifacts},
      getSetupState: async () => repository.getSetupState(),
      auth: {
        setup: createOwnerSetupService({ repository, ...options }),
        sessions,
      },
    });
    logger = app.log;
    if(options.warmOcr){
      const started=performance.now();
      logger.info({code:'OCR_WARMUP_STARTED'},'OCR startup warmup started');
      if(!ocr.warmup)throw new Error('OCR startup warmup is unavailable');
      await ocr.warmup();
      logger.info({code:'OCR_WARMUP_READY',durationMs:Math.round(performance.now()-started)},'OCR startup warmup completed');
    }
    for (const diagnostic of pendingVersionDiagnostics.splice(0)) logVersionDiagnostic(diagnostic);
    app.addHook('onClose', async () => {
      try { await closeResources(); }
      catch (cause) {
        app.log.error({ code: 'API_RESOURCE_CLEANUP_FAILED', causeTypes: safeCauseTypes(cause) }, 'API resource cleanup failed');
        throw cause;
      }
    });
    return app;
  } catch (error) {
    try { await closeResources(); } catch (closeError) {
      throw new AggregateError([error, closeError], 'API initialization and cleanup both failed');
    }
    throw error;
  }
}

export async function serveApi(app: FastifyInstance, config: AppConfig, signals: Pick<EventEmitter, 'once' | 'removeListener'> = process): Promise<string> {
  let closing = false;
  const removeSignals = () => {
    signals.removeListener('SIGINT', shutdown);
    signals.removeListener('SIGTERM', shutdown);
  };
  const shutdown = () => {
    if (closing) return;
    closing = true;
    removeSignals();
    void app.close().catch((error: unknown) => {
      process.exitCode = 1;
      app.log.error({ code: 'API_SHUTDOWN_FAILED', causeTypes: safeCauseTypes(error) }, 'API shutdown failed');
    });
  };
  signals.once('SIGINT', shutdown);
  signals.once('SIGTERM', shutdown);
  try {
    return await app.listen({ host: config.host, port: config.port, listenTextResolver: safeListenTextResolver });
  } catch (error) {
    closing = true;
    removeSignals();
    try {
      await app.close();
    } catch (closeError) {
      throw new AggregateError([error, closeError], 'API startup and cleanup both failed');
    }
    throw error;
  }
}
