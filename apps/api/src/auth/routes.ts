import type { FastifyInstance, FastifyRequest } from 'fastify';
import { loginRequestSchema, setupRequestSchema, passwordChangeRequestSchema, passwordChangeResponseSchema } from '@remote-webos-tv/contracts';

import type { AppConfig } from '../config.js';
import { OwnerSetupError, type OwnerSetupService } from './service.js';
import { PasswordChangeError, PasswordChangeStorageError, type AuthSessionService } from './sessions.js';
import { httpPolicy } from '../security/http-policy.js';

export interface AuthRoutesDependencies {
  readonly config: AppConfig;
  readonly setup: OwnerSetupService;
  readonly sessions: AuthSessionService;
  readonly beforeAuthAttempt?: (kind: 'setup' | 'login', request: FastifyRequest) => Promise<void>;
}

function sessionCookie(request: FastifyRequest): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const values = header.split(';').map((part) => part.trim());
  const cookies = values.filter((part) => part.startsWith('remote_webos_session='));
  if (cookies.length !== 1) return undefined;
  return cookies[0]!.slice('remote_webos_session='.length);
}

export function registerAuthRoutes(app: FastifyInstance, { config, setup, sessions, beforeAuthAttempt }: AuthRoutesDependencies): (request: FastifyRequest) => string | undefined {
  if (config.publicOrigin.startsWith('https://') && !config.secureCookies) {
    throw new Error('Secure cookies are required for an HTTPS public origin');
  }
  const cookieHeader = (token: string, maxAge = 86400) => `remote_webos_session=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${config.secureCookies ? '; Secure' : ''}`;
  const error = (request: FastifyRequest, code: string, message: string) => ({ code, message, requestId: request.id });
  // Internal ownership context, never a request field or public session response.
  const authenticatedSessions = new WeakMap<FastifyRequest, string>();
  app.addHook('onRequest', async (request, reply) => {
    const policy = httpPolicy(request);
    if (!policy.api) return;
    if (request.is404) return;
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (mutating && request.headers.origin !== config.publicOrigin) {
      reply.code(403).send(error(request, 'FORBIDDEN', 'Forbidden'));
      return;
    }
    if (!policy.requiresSession) return;
    const cookie = sessionCookie(request);
    if (!sessions.authenticate(cookie)) {
      reply.code(401).send(error(request, 'UNAUTHORIZED', 'Unauthorized'));
      return;
    }
    if (mutating && !sessions.verifyCsrf(cookie!, request.headers['x-csrf-token'])) {
      reply.code(403).send(error(request, 'FORBIDDEN', 'Forbidden'));
      return;
    }
    authenticatedSessions.set(request, cookie!);
  });

  app.post('/api/setup', async (request, reply) => {
    if (beforeAuthAttempt) await beforeAuthAttempt('setup', request);
    const parsed = setupRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(error(request, 'BAD_REQUEST', 'Bad request'));
    try {
      await setup.claimOwner(parsed.data);
    } catch (cause) {
      if (cause instanceof OwnerSetupError) {
        const status = cause.code === 'INVALID_OWNER_INPUT' ? 400 : 403;
        return reply.code(status).send(error(request, status === 400 ? 'BAD_REQUEST' : 'FORBIDDEN', status === 400 ? 'Bad request' : 'Forbidden'));
      }
      throw cause;
    }
    return reply.code(201).send();
  });

  app.post('/api/auth/login', async (request, reply) => {
    if (beforeAuthAttempt) await beforeAuthAttempt('login', request);
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(error(request, 'BAD_REQUEST', 'Bad request'));
    const result = await sessions.login(parsed.data.username, parsed.data.password);
    if (!result) return reply.code(401).send(error(request, 'INVALID_CREDENTIALS', 'Invalid credentials'));
    reply.header('set-cookie', cookieHeader(result.token));
    return reply.code(200).send({ username: result.username });
  });

  let passwordLimiter: ReturnType<FastifyInstance['createRateLimit']> | undefined;
  app.post('/api/auth/password', async (request, reply) => {
    passwordLimiter ??= app.createRateLimit({ max: 5, timeWindow: 60_000, keyGenerator: () => 'owner-password-change' });
    const limit = await passwordLimiter(request);
    if (!limit.isAllowed && limit.isExceeded) return reply.header('retry-after', limit.ttlInSeconds).code(429).send(error(request, 'RATE_LIMITED', 'Too many requests'));
    const parsed = passwordChangeRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(error(request, 'BAD_REQUEST', 'Bad request'));
    try {
      const result = await sessions.changePassword(authenticatedSessions.get(request)!, parsed.data.currentPassword, parsed.data.newPassword);
      reply.header('set-cookie', cookieHeader(result.token));
      if (result.cleanupWarning) app.log.error({ code: 'PASSWORD_CHANGE_CLEANUP_FAILED', requestId: request.id }, 'Password changed; session resource cleanup failed');
      return passwordChangeResponseSchema.parse({ username: result.username, csrfToken: result.csrfToken, cleanupWarning: result.cleanupWarning });
    } catch (cause) {
      if (cause instanceof PasswordChangeError) {
        const status = cause.code === 'UNAUTHORIZED' ? 401 : cause.code === 'BAD_REQUEST' ? 400 : 403;
        return reply.code(status).send(error(request, cause.code, cause.code === 'INVALID_CURRENT_PASSWORD' ? 'Invalid current password' : 'Request rejected'));
      }
      if (cause instanceof PasswordChangeStorageError) {
        app.log.error({ code: 'STORAGE_UNAVAILABLE', requestId: request.id }, 'Password storage unavailable');
        return reply.code(503).send(error(request, 'STORAGE_UNAVAILABLE', 'Storage unavailable'));
      }
      throw cause;
    }
  });

  app.get('/api/auth/session', async (request, reply) => {
    const identity = sessions.authenticate(sessionCookie(request));
    if (!identity) return reply.code(401).send(error(request, 'UNAUTHORIZED', 'Unauthorized'));
    return identity;
  });

  app.post('/api/auth/logout', async (request, reply) => {
    reply.header('set-cookie', cookieHeader('', 0));
    await sessions.revoke(sessionCookie(request)!);
    return reply.code(204).send();
  });
  return (request) => authenticatedSessions.get(request);
}
