const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
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

  const sqlPath = path.join(__dirname, '../002_verificar.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await db.connect();
    console.log('Ejecutando pruebas de integridad (002_verificar.sql)...');
    await db.query(sql);
    console.log('✅ Verificación de integridad completada exitosamente.');
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error('❌ Fallo en la verificación de integridad:', err.message);
  process.exitCode = 1;
});
