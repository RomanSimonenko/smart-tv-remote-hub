import { i18n } from './i18n.js';
const t=(key:string,values:Record<string,unknown>={})=>i18n.t(key,{ns:'common',...values});
import {ocrDiagnosticsSchema} from '@remote-webos-tv/contracts';
import { testCasesResponseSchema, testCaseSchema, type CreateTestCase, type UpdateTestCase } from '@remote-webos-tv/contracts';
import { profileResponseSchema, passwordChangeResponseSchema, type PasswordChangeRequest, type ProfileUpdate } from '@remote-webos-tv/contracts';
import { apiErrorSchema, loginResponseSchema, sessionResponseSchema, setupStatusSchema, tvStatusResponseSchema, tvOperationSchema, tvCommandResultSchema, tvRemoteStateSchema, type LoginRequest, type SetupRequest, type StartTvOperation, type TvOperation, type TvStatusResponse, type TvCommandRequest, type TvCommandResult, type TvRemoteState } from '@remote-webos-tv/contracts';
import { tvPowerStateSchema, tvPowerOperationSchema, type TvPowerRequest } from '@remote-webos-tv/contracts';
import { tvDevicesResponseSchema, addTvResponseSchema, type TvId, type AddTvRequest } from '@remote-webos-tv/contracts';
import type { TvHoldRequest } from '@remote-webos-tv/contracts';
import {testRunSchema,testRunsResponseSchema,type StartTestRun,type RunFailure} from '@remote-webos-tv/contracts';
import type {CameraSnapshot} from './camera-snapshot.js';
import {cameraPreviewSchema,type CameraPrior} from '@remote-webos-tv/contracts';

export class ApiFailure extends Error {
  constructor(readonly status: number, readonly code: string) { super('API request failed'); }
  get commandRejectedBeforeDispatch(): boolean { return validatedCommandRejections.has(this); }
  get powerRejectedBeforeDispatch(): boolean { return validatedPowerRejections.has(this); }
}
// Status/code alone (including a manually constructed ApiFailure) cannot prove
// delivery. Only this module's validated command error response can mark it.
const validatedCommandRejections = new WeakSet<ApiFailure>();
const validatedPowerRejections = new WeakSet<ApiFailure>();
const powerRejections: Readonly<Record<number, readonly string[]>> = {
  400: ['BAD_REQUEST'], 403: ['FORBIDDEN'],
  409: ['OPERATION_CONFLICT', 'INVALID_ACTION', 'SERVICE_CLOSED', 'CLEANUP_FAILED', 'TV_UNAVAILABLE', 'WOL_NOT_CONFIGURED', 'POWER_RECEIPT_CAPACITY'],
  422: ['UNSUPPORTED_CAPABILITY'], 429: ['RATE_LIMITED'],
};

async function request(path: string, init?: RequestInit, resultStatuses: readonly number[] = []): Promise<Response> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { credentials: 'same-origin', cache: 'no-store', ...init }); }
  catch { throw new ApiFailure(0, 'NETWORK_ERROR'); }
  if (!response.ok && !resultStatuses.includes(response.status)) {
    let code = 'UNEXPECTED_ERROR';
    let commandRejected = false;
    let powerRejected = false;
    try {
      const parsed = apiErrorSchema.safeParse(await response.json());
      if (parsed.success) {
        code = parsed.data.code;
        commandRejected = /^\/(?:tv|tvs\/[^/]+)\/(?:commands|holds)$/.test(path) && ((response.status === 400 && code === 'BAD_REQUEST') || (response.status === 403 && code === 'FORBIDDEN'));
        powerRejected = /^\/(?:tv|tvs\/[^/]+)\/power$/.test(path) && init?.method === 'POST' && !!powerRejections[response.status]?.includes(code);
      }
    } catch { /* Malformed responses remain generic API failures. */ }
    const failure = new ApiFailure(response.status, code);
    if (commandRejected) validatedCommandRejections.add(failure);
    if (powerRejected) validatedPowerRejections.add(failure);
    throw failure;
  }
  return response;
}

async function parsed<T>(response: Response, schema: { parse(value: unknown): T }): Promise<T> {
  try { return schema.parse(await response.json()); }
  catch { throw new ApiFailure(response.status, 'INVALID_RESPONSE'); }
}

const jsonHeaders = { 'content-type': 'application/json' };
const tvPath = (tvId?: TvId) => tvId ? `/tvs/${encodeURIComponent(tvId)}` : '/tv';
async function dispatchCommand(kind: 'commands' | 'holds', input: TvCommandRequest | TvHoldRequest, csrfToken: string, signal?: AbortSignal, tvId?: TvId): Promise<TvCommandResult> {
  const response = await request(`${tvPath(tvId)}/${kind}`, { method: 'POST', headers: { ...jsonHeaders, 'x-csrf-token': csrfToken }, body: JSON.stringify(input), signal: signal ?? null }, [409, 422, 429, 503, 504]);
  const result = await parsed(response, tvCommandResultSchema);
  const expectedStatus = result.outcome === 'sent' ? 200 : result.outcome === 'unknown' ? 504 : {
    TV_UNAVAILABLE: 409, TV_BUSY: 409, UNSUPPORTED_CAPABILITY: 422, APP_NOT_AVAILABLE: 422, APP_LIST_UNAVAILABLE: 503, COMMAND_NOT_SENT: 503, RATE_LIMITED: 429,
  }[result.error.code];
  if (result.id !== input.id || response.status !== expectedStatus) throw new ApiFailure(response.status, 'INVALID_RESPONSE');
  return result;
}
export const api = {
  async diagnoseOcr(image:Blob,csrfToken:string,signal:AbortSignal){return parsed(await request('/camera/ocr',{method:'POST',headers:{'content-type':'image/jpeg','x-csrf-token':csrfToken},body:image,signal}),ocrDiagnosticsSchema);},
  async cameraPreview(image:Blob,csrfToken:string,prior:CameraPrior|undefined,signal:AbortSignal){return parsed(await request('/camera/preview',{method:'POST',headers:{'content-type':'image/png','x-csrf-token':csrfToken,...(prior?{'x-screen-prior':JSON.stringify(prior)}:{})},body:image,signal}),cameraPreviewSchema);},
  async cameraSnapshot(image:Blob,csrfToken:string,prior:CameraPrior,signal:AbortSignal){return parsed(await request('/camera/snapshot',{method:'POST',headers:{'content-type':'image/png','x-csrf-token':csrfToken,...(prior?{'x-screen-prior':JSON.stringify(prior)}:{})},body:image,signal}),cameraPreviewSchema);},
  async listTestRuns(before?:string,signal?:AbortSignal,filters:{query?:string;status?:string;tvId?:string;since?:number;until?:number}={}){const params=new URLSearchParams();if(before)params.set('before',before);for(const [key,value]of Object.entries(filters))if(value!==''&&value!==undefined)params.set(key,String(value));return parsed(await request(`/test-runs${params.size?`?${params}`:''}`,{signal:signal??null}),testRunsResponseSchema);},
  async getTestRun(id:string,signal?:AbortSignal){return parsed(await request(`/test-runs/${encodeURIComponent(id)}`,{signal:signal??null}),testRunSchema);},
  async startTestRun(input:StartTestRun,csrfToken:string,signal?:AbortSignal){return parsed(await request('/test-runs',{method:'POST',headers:{...jsonHeaders,'x-csrf-token':csrfToken},body:JSON.stringify(input),signal:signal??null}),testRunSchema);},
  async runAction(id:string,action:'advance'|'stop'|'heartbeat'|'failure',csrfToken:string,body?:{itemId:string}|RunFailure,signal?:AbortSignal){return parsed(await request(`/test-runs/${encodeURIComponent(id)}/${action}`,{method:'POST',headers:{...jsonHeaders,'x-csrf-token':csrfToken},body:JSON.stringify(body??{}),signal:signal??null}),testRunSchema);},
  async saveRunSnapshot(id:string,itemId:string,snapshot:CameraSnapshot,csrfToken:string,signal:AbortSignal){return parsed(await request(`/test-runs/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/snapshot`,{method:'PUT',headers:{'content-type':'image/jpeg','x-csrf-token':csrfToken,'x-captured-at':String(snapshot.capturedAt),'x-camera-label':encodeURIComponent(snapshot.cameraLabel)},body:snapshot.blob,signal:AbortSignal.any([signal,AbortSignal.timeout(45000)])}),testRunSchema);},
  async listTestCases(signal?: AbortSignal) { return parsed(await request('/test-cases', {signal:signal??null}), testCasesResponseSchema); },
  async getTestCase(id:string,signal?:AbortSignal) { return parsed(await request(`/test-cases/${encodeURIComponent(id)}`,{signal:signal??null}),testCaseSchema); },
  async createTestCase(input:CreateTestCase,csrfToken:string,signal?:AbortSignal) { return parsed(await request('/test-cases',{method:'POST',headers:{...jsonHeaders,'x-csrf-token':csrfToken},body:JSON.stringify(input),signal:signal??null}),testCaseSchema); },
  async updateTestCase(id:string,input:UpdateTestCase,csrfToken:string,signal?:AbortSignal) { return parsed(await request(`/test-cases/${encodeURIComponent(id)}`,{method:'PUT',headers:{...jsonHeaders,'x-csrf-token':csrfToken},body:JSON.stringify(input),signal:signal??null}),testCaseSchema); },
  async changePassword(input: PasswordChangeRequest, csrfToken: string) {
    return parsed(await request('/auth/password', { method: 'POST', headers: { ...jsonHeaders, 'x-csrf-token': csrfToken }, body: JSON.stringify(input) }), passwordChangeResponseSchema);
  },
  async getProfile(signal?: AbortSignal) { return parsed(await request('/profile', { signal: signal ?? null }), profileResponseSchema); },
  async updateProfile(input: ProfileUpdate, csrfToken: string, signal?: AbortSignal) { return parsed(await request('/profile', { method: 'PATCH', headers: { ...jsonHeaders, 'x-csrf-token': csrfToken }, body: JSON.stringify(input), signal: signal ?? null }), profileResponseSchema); },
  async tvDevices(signal?: AbortSignal) { return parsed(await request('/tvs', { signal: signal ?? null }), tvDevicesResponseSchema); },
  async deleteTv(tvId: TvId, csrfToken: string, signal: AbortSignal) {
    const response = await request(`/tvs/${tvId}`, { method: 'DELETE', headers: { ...jsonHeaders, 'x-csrf-token': csrfToken }, body: JSON.stringify({ confirm: true }), signal });
    if (response.status !== 204) throw new ApiFailure(response.status, 'INVALID_RESPONSE');
  },
  async addTv(input: AddTvRequest, csrfToken: string, signal?: AbortSignal) {
    return parsed(await request('/tvs', { method: 'POST', headers: { ...jsonHeaders, 'x-csrf-token': csrfToken }, body: JSON.stringify(input), signal: signal ?? null }), addTvResponseSchema);
  },
  async status() { return parsed(await request('/setup/status'), setupStatusSchema); },
  async session(signal?:AbortSignal) { return parsed(await request('/auth/session',signal?{signal}:undefined), sessionResponseSchema); },
  async setup(input: SetupRequest) { await request('/setup', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(input) }); },
  async login(input: LoginRequest) { return parsed(await request('/auth/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(input) }), loginResponseSchema); },
  async logout(csrfToken: string) { await request('/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrfToken } }); },
  // JSON cannot carry an explicitly undefined optional property. The validated
  // wire values satisfy the contracts' stricter exact-optional public types.
  async tvStatus(signal?: AbortSignal, tvId?: TvId): Promise<TvStatusResponse> { return await parsed(await request(tvPath(tvId), { signal: signal ?? null }), tvStatusResponseSchema) as TvStatusResponse; },
  async startTvOperation(input: StartTvOperation, csrfToken: string, signal?: AbortSignal, tvId?: TvId) {
    return await parsed(await request(`${tvPath(tvId)}/operations`, { method: 'POST', headers: { ...jsonHeaders, 'x-csrf-token': csrfToken }, body: JSON.stringify(input), signal: signal ?? null }), tvOperationSchema) as TvOperation;
  },
  async submitTvPin(id: string, pin: string, csrfToken: string, signal: AbortSignal, tvId?: TvId) {
    return await parsed(await request(`${tvPath(tvId)}/operations/${encodeURIComponent(id)}/pin`, {method:'POST',headers:{...jsonHeaders,'x-csrf-token':csrfToken},body:JSON.stringify({pin}),signal}),tvOperationSchema) as TvOperation;
  },
  async cancelTvOperation(id: string, csrfToken: string, signal?: AbortSignal, tvId?: TvId) {
    return await parsed(await request(`${tvPath(tvId)}/operations/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: { 'x-csrf-token': csrfToken }, signal: signal ?? null }), tvOperationSchema) as TvOperation;
  },
  async remoteState(signal?: AbortSignal, tvId?: TvId): Promise<TvRemoteState> {
    return parsed(await request(`${tvPath(tvId)}/remote`, { signal: signal ?? null }), tvRemoteStateSchema);
  },
  async powerState(signal?: AbortSignal, tvId?: TvId) {
    return parsed(await request(`${tvPath(tvId)}/power`, { signal: signal ?? null }), tvPowerStateSchema);
  },
  async setTvMac(mac: string | null, csrfToken: string, signal?: AbortSignal, tvId?: TvId) {
    return parsed(await request(`${tvPath(tvId)}/mac`, { method: 'PUT', headers: { ...jsonHeaders, 'x-csrf-token': csrfToken }, body: JSON.stringify({ mac }), signal: signal ?? null }), tvPowerStateSchema);
  },
  async startPower(input: TvPowerRequest, csrfToken: string, signal?: AbortSignal, tvId?: TvId) {
    const response = await request(`${tvPath(tvId)}/power`, { method: 'POST', headers: { ...jsonHeaders, 'x-csrf-token': csrfToken }, body: JSON.stringify(input), signal: signal ?? null });
    const result = await parsed(response, tvPowerOperationSchema);
    if (response.status !== 202 || result.id !== input.id || result.action !== input.action) throw new ApiFailure(response.status, 'INVALID_RESPONSE');
    return result;
  },
  async cancelPower(id: string, csrfToken: string, signal?: AbortSignal, tvId?: TvId) {
    const response = await request(`${tvPath(tvId)}/power/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: { 'x-csrf-token': csrfToken }, signal: signal ?? null });
    const result = await parsed(response, tvPowerOperationSchema);
    if (response.status !== 200 || result.id !== id) throw new ApiFailure(response.status, 'INVALID_RESPONSE');
    return result;
  },
  async sendCommand(input: TvCommandRequest, csrfToken: string, signal?: AbortSignal, tvId?: TvId): Promise<TvCommandResult> {
    // Only this route carries a command result on these non-success statuses.
    // Auth/schema errors continue through the shared API-error handling.
    return dispatchCommand('commands', input, csrfToken, signal, tvId);
  },
  async holdTvButton(input: TvHoldRequest, csrfToken: string, signal: AbortSignal, tvId?: TvId): Promise<TvCommandResult> {
    return dispatchCommand('holds', input, csrfToken, signal, tvId);
  },
};

export function friendlyError(error: unknown): string {
  if (error instanceof ApiFailure) {
    if(error.code==='VERSION_CONFLICT')return t('versionConflict');
    if(error.code==='RUN_OWNED_BY_ANOTHER_SESSION')return t('runOwned');
    if(error.code==='ARTIFACT_QUOTA_EXCEEDED')return t('quotaExceeded');
    if(error.code==='ARTIFACT_STORAGE_FAILED')return t('artifactFailed');
    if(error.code==='RUN_CONFLICT'||error.code==='RUN_NOT_ACTIVE')return t('runChanged');
    if (error.code === 'OPERATION_CONFLICT') return t('operationConflict');
    if (error.code === 'INVALID_ACTION') return t('invalidAction');
    if (error.code === 'OPERATION_NOT_FOUND') return t('operationNotFound');
    if (error.code === 'SERVICE_CLOSED') return t('serviceClosed');
    if (error.code === 'POWER_RECEIPT_CAPACITY') return t('powerCapacity');
    if (error.code === 'WOL_NOT_CONFIGURED') return t('wolMissing');
    if (error.code === 'UNSUPPORTED_CAPABILITY') return t('unsupportedCapability');
    if (error.code === 'TV_UNAVAILABLE') return t('tvUnavailable');
    if (error.code === 'CLEANUP_FAILED') return t('cleanupFailed');
    if (error.code === 'INVALID_RESPONSE') return t('invalidResponse');
    if (error.status === 401 && error.code === 'INVALID_CREDENTIALS') return t('invalidCredentials');
    if (error.status === 429) return t('tooManyAttempts');
    if (error.status === 403) return t('forbidden');
    if (error.status === 400) return t('invalidInput');
    if (error.code === 'NETWORK_ERROR') return t('networkError');
  }
  return t('requestFailed');
}
