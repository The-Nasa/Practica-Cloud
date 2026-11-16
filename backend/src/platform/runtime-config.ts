export function boundedInteger(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`Invalid ${name}`);
  return result;
}

export function validateRuntimeEnvironment(env: NodeJS.ProcessEnv) {
  for (const name of ['SESSION_COOKIE_SECURE', 'HTTP_ACCESS_LOG']) {
    if (env[name] !== undefined && !['true', 'false'].includes(env[name]!)) throw new Error(`Invalid ${name}`);
  }
  const proxyHops = boundedInteger(env.TRUST_PROXY_HOPS, 0, 0, 1, 'TRUST_PROXY_HOPS');
  const origins = (env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(v => v.trim());
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error('Invalid CORS_ORIGIN'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error('Invalid CORS_ORIGIN');
    if (env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Production requires HTTPS CORS_ORIGIN');
  }
  if (env.NODE_ENV === 'production' && env.SESSION_COOKIE_SECURE !== 'true') throw new Error('Production requires secure session cookies');
  return { proxyHops, origins };
}
