import { PasswordHasher } from './password.service';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();
  it('verifica la contraseña y rechaza otra', async () => {
    const stored = await hasher.hash('Ejemplo-de-prueba-42');
    expect(await hasher.verify('Ejemplo-de-prueba-42', stored)).toBe(true);
    expect(await hasher.verify('Otra-contraseña', stored)).toBe(false);
  });
  it('rechaza un hash corrupto sin lanzar un error interno', async () => {
    expect(await hasher.verify('prueba', 'salt:00')).toBe(false);
    expect(await hasher.verify('prueba', 'invalido')).toBe(false);
  });
});
