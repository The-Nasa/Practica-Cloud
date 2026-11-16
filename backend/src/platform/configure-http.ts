import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { json } from 'express';
import { AllExceptionsFilter } from './filters/http-exception.filter';
import { validateRuntimeEnvironment } from './runtime-config';

/** Shared by production bootstrap and HTTP integration tests. */
export function configureHttp(app: INestApplication): void {
  const { origins, proxyHops } = validateRuntimeEnvironment(process.env);
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  express.set('trust proxy', proxyHops);
  const accessLogger = new Logger('HttpAccess');
  const authLimit = Number(process.env.AUTH_RATE_LIMIT || 30);
  if (!Number.isInteger(authLimit) || authLimit < 1) throw new Error('Invalid AUTH_RATE_LIMIT');
  const authBuckets = new Map<string, { count: number; expiresAt: number }>();
  // Keep Nest's default parser for other routes; registering a named jsonParser
  // on a path makes the Express adapter mistakenly consider it global.
  const imageJson = json({ limit: '3mb' });
  app.use('/api/v1/merchant/products', (request: Request, response: Response, next: NextFunction) => imageJson(request,response,next));
  app.use('/api/v1/me/avatar', (request: Request, response: Response, next: NextFunction) => imageJson(request,response,next));
  app.use('/api/v1/merchant/stores', (request: Request, response: Response, next: NextFunction) => {
    if (/^\/[^/]+\/branding\/(logo|banner)$/.test(request.path)) imageJson(request,response,next);
    else next();
  });
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, X-CSRF-Token, Idempotency-Key, X-Request-Id',
    exposedHeaders: 'X-Request-Id',
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.headers['access-control-request-private-network']) {
      response.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    const supplied = request.headers['x-request-id'];
    const requestId = typeof supplied === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied)
      ? supplied : randomUUID();
    request.headers['x-request-id'] = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    if (process.env.HTTP_ACCESS_LOG === 'true' || (process.env.NODE_ENV === 'production' && process.env.HTTP_ACCESS_LOG !== 'false')) {
      const start = performance.now();
      response.once('finish', () => accessLogger.log(JSON.stringify({ event: 'http_request', requestId,
        method: request.method, route: typeof request.route?.path === 'string' ? request.route.path : '<unmatched>',
        status: response.statusCode, durationMs: Math.round((performance.now() - start) * 100) / 100 })));
    }
    if (request.path.startsWith('/api/v1/auth/') || request.path === '/api/v1/me' || request.path.startsWith('/api/v1/me/') || request.path.startsWith('/api/v1/merchant/') || request.path.startsWith('/api/v1/admin/')) {
      response.setHeader('Cache-Control', 'no-store');
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !origins.includes(request.headers.origin || '')) {
      response.status(403).json({
        statusCode: 403, error: 'Forbidden', code: 'ORIGIN_NOT_ALLOWED',
        message: 'El origen de la solicitud no está autorizado', requestId,
        timestamp: new Date().toISOString(), path: request.path,
      });
      return;
    }
    if (request.method === 'POST' && ['/api/v1/auth/login', '/api/v1/auth/register'].includes(request.path)) {
      const now = Date.now();
      for (const [key, value] of authBuckets) if (value.expiresAt <= now) authBuckets.delete(key);
      const key = `${request.ip}:${request.path}`;
      const bucket = authBuckets.get(key) || { count: 0, expiresAt: now + 60000 };
      authBuckets.set(key, bucket);
      if (++bucket.count > authLimit) {
        response.setHeader('Retry-After', String(Math.ceil((bucket.expiresAt - now) / 1000)));
        response.status(429).json({ statusCode: 429, error: 'Too Many Requests', code: 'AUTH_RATE_LIMIT',
          message: 'Demasiados intentos. Espera un minuto antes de volver a intentarlo.', requestId,
          timestamp: new Date().toISOString(), path: request.path });
        return;
      }
    }
    next();
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
}
