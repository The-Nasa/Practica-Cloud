const { Client } = require('pg');
const { applyMigrations } = require('./migrations.cjs');
require('dotenv').config();
require('dotenv').config({ path: '.env.local' });
(async () => {
  if (!process.env.DATABASE_URL && !process.env.DATABASE_HOST) throw new Error('DATABASE_CONFIGURATION_REQUIRED');
  const useSsl = process.env.DATABASE_SSL === 'true' || process.env.DATABASE_URL?.includes('supabase') || process.env.DATABASE_HOST?.includes('supabase');
  const ssl = useSsl ? { rejectUnauthorized: false } : undefined;
  const db = new Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, ssl } : {
    host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME,
    ssl,
  });
  try { await db.connect(); await applyMigrations(db); console.log('Migraciones verificadas.'); }
  finally { await db.end(); }
})().catch((error) => {
  const code = String(error.code || error.message);
  console.error(`No se pudieron aplicar migraciones (${/^[A-Z0-9_]+$/.test(code) ? code : 'MIGRATION_FAILED'}). No se imprimen datos de conexión.`);
  process.exitCode = 1;
});
