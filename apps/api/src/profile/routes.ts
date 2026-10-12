import type { FastifyInstance } from 'fastify';
import { profileUpdateSchema } from '@remote-webos-tv/contracts';
import type { ProfileRepository } from './repository.js';

export function registerProfileRoutes(app: FastifyInstance, repository: ProfileRepository): void {
  app.get('/api/profile', async () => repository.read());
  let limiter: ReturnType<FastifyInstance['createRateLimit']> | undefined;
  app.patch('/api/profile', async (request, reply) => {
    limiter ??= app.createRateLimit({ max: 20, timeWindow: 60_000, keyGenerator: () => 'owner-profile' });
    const limit = await limiter(request);
    if (!limit.isAllowed && limit.isExceeded) return reply.header('retry-after', limit.ttlInSeconds).code(429).send({ code: 'RATE_LIMITED', message: 'Too many requests', requestId: request.id });
    const parsed = profileUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Bad request', requestId: request.id });
    return repository.update(parsed.data);
  });
}
