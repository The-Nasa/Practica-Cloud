import { IdentityService } from './identity.service';
describe('Login real', () => {
 it.each(['123456', 'Password123!'])('no acepta %s como contraseña universal de cuentas quickly.pe', async password => {
  const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'account', status: 'active', password_hash: 'hash-real' }] }), withTransaction: jest.fn() };
  const hasher = { verify: jest.fn().mockResolvedValue(false) };
  const service = new IdentityService(db as any, hasher as any, {} as any, {} as any);
  await expect(service.login({ email: 'cuenta@quickly.pe', password })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }) });
  expect(db.withTransaction).not.toHaveBeenCalled();
 });
});
