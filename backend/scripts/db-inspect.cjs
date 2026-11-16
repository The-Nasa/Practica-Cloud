const { Client } = require('pg');
const { config } = require('dotenv');

config({ path: '.env' });
config({ path: '.env.local' });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no configurada');
  const useSsl = process.env.DATABASE_SSL === 'true' || process.env.DATABASE_URL?.includes('supabase') || process.env.DATABASE_HOST?.includes('supabase');
  const ssl = useSsl ? { rejectUnauthorized: false } : undefined;
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl, connectionTimeoutMillis: 5000 });
  try {
    await db.connect();
    // A read-only transaction protects this inventory from accidental future writes.
    await db.query('BEGIN READ ONLY');
    const version = await db.query('SHOW server_version');
    const columns = await db.query(`SELECT table_schema,table_name,column_name,data_type,is_nullable
      FROM information_schema.columns WHERE table_schema IN
      ('identity','geography','merchant','catalog','ordering','inventory','billing','delivery','support','platform')
      ORDER BY table_schema,table_name,ordinal_position`);
    const objects = await db.query(`SELECT table_schema,table_name,table_type FROM information_schema.tables
      WHERE table_schema IN ('identity','geography','merchant','catalog','ordering','inventory','billing','delivery','support','platform')
      ORDER BY table_schema,table_name`);
    const indexes = await db.query(`SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes
      WHERE schemaname IN ('identity','geography','merchant','catalog','ordering','inventory','billing','delivery','support','platform') ORDER BY schemaname,indexname`);
    const triggers = await db.query(`SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname AS trigger_name,
      pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN
      ('identity','geography','merchant','catalog','ordering','inventory','billing','delivery','support','platform') ORDER BY 1,2,3`);
    const views = await db.query(`SELECT schemaname,viewname,definition FROM pg_views WHERE schemaname IN
      ('identity','geography','merchant','catalog','ordering','inventory','billing','delivery','support','platform') ORDER BY 1,2`);
    const constraints = await db.query(`SELECT n.nspname AS schema_name,r.relname AS table_name,c.conname AS constraint_name,
      pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname IN
      ('identity','geography','merchant','catalog','ordering','inventory','billing','delivery','support','platform') ORDER BY 1,2,3`);
    await db.query('ROLLBACK');
    console.log(JSON.stringify({ version: version.rows[0].server_version, objects: objects.rows,
      columns: columns.rows, indexes: indexes.rows, triggers: triggers.rows, views: views.rows, constraints: constraints.rows }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`No se pudo inspeccionar PostgreSQL (${error.code || 'CONFIGURATION'}). Configure DATABASE_URL y revise conectividad/permisos. No se imprimen credenciales.`);
  process.exitCode = 1;
});
