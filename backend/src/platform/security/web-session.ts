import { createHash, timingSafeEqual } from 'crypto';
import { CookieOptions, Request } from 'express';

export const SESSION_COOKIE_NAME = 'quickly_session';

export function readSessionToken(request: Pick<Request, 'headers'>): string | undefined {
  const authHeader = request.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (/^[a-f0-9]{64}$/.test(bearerToken)) return bearerToken;
  }
  const values = (request.headers.cookie || '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (values.length !== 1) return undefined;
  const token = values[0].slice(SESSION_COOKIE_NAME.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}

export function csrfForSession(token: string): string {
  return createHash('sha256').update('quickly:csrf:v1:').update(token).digest('hex');
}

export function isCsrfValid(token: string, supplied: unknown): boolean {
  if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(csrfForSession(token), 'hex'), Buffer.from(supplied, 'hex'));
}

export function sessionCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSiteEnv = process.env.SESSION_COOKIE_SAMESITE?.toLowerCase();
  const sameSite: 'none' | 'lax' | 'strict' = (sameSiteEnv === 'none' || sameSiteEnv === 'lax' || sameSiteEnv === 'strict')
    ? sameSiteEnv
    : (isProd ? 'none' : 'lax');
  const secure = sameSite === 'none'
    || process.env.SESSION_COOKIE_SECURE === 'true'
    || (isProd && process.env.SESSION_COOKIE_SECURE !== 'false');

  return {
    httpOnly: true,
    path: '/',
    sameSite,
    secure,
  };
}
