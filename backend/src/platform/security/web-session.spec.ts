import { csrfForSession, isCsrfValid, readSessionToken, sessionCookieOptions } from './web-session';

describe('Sesión web', () => {
  const token = 'a'.repeat(64);
  it('acepta cookie de sesión o Bearer token con formato válido', () => {
    expect(readSessionToken({ headers: { cookie: `other=x; quickly_session=${token}` } })).toBe(token);
    expect(readSessionToken({ headers: { cookie: `quickly_session=${token}; quickly_session=${token}` } })).toBeUndefined();
    expect(readSessionToken({ headers: { authorization: `Bearer ${token}` } })).toBe(token);
    expect(readSessionToken({ headers: { authorization: 'Bearer invalid' } })).toBeUndefined();
  });
  it('CSRF pertenece a la sesión y no equivale a la credencial', () => {
    const csrf = csrfForSession(token);
    expect(csrf).not.toBe(token);
    expect(isCsrfValid(token, csrf)).toBe(true);
    expect(isCsrfValid('b'.repeat(64), csrf)).toBe(false);
    expect(isCsrfValid(token, undefined)).toBe(false);
    expect(isCsrfValid(token, 'malformado')).toBe(false);
  });
  it('usa HttpOnly y SameSite Lax', () => {
    expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});
