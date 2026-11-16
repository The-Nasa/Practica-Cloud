import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';
describe('Selección de transporte PostgreSQL', () => {
 it.each([
  [{ DATABASE_URL: 'postgresql://local@127.0.0.1:15432/postgres', DATABASE_HOST: 'db.example.supabase.co' }, false],
  [{ DATABASE_URL: 'postgresql://local@127.0.0.1:15432/postgres', DATABASE_SSL: 'true' }, true],
  [{ DATABASE_URL: 'postgresql://user@db.example.supabase.co/app', DATABASE_SSL: 'false' }, false],
  [{ DATABASE_URL: 'postgresql://user@db.example.supabase.co/app' }, true],
 ])('respeta URL elegida y configuración explícita sin conectar', async (values, expected) => {
  const service = new DatabaseService(new ConfigService(values));
  expect(Boolean((service.getPool() as any).options.ssl)).toBe(expected);
  await service.onModuleDestroy();
 });
});
