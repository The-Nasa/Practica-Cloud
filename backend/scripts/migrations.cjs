const { readdir, readFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const path = require('node:path');

async function applyMigrations(client) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('quickly.schema_migrations'))");
    if (!(await client.query("SELECT to_regclass('identity.users') AS baseline")).rows[0].baseline) {
      throw new Error('BASELINE_REQUIRED');
    }
    await client.query(`CREATE TABLE IF NOT EXISTS platform.schema_migrations (
      version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const directory = path.join(__dirname, '../migrations');
    const files = (await readdir(directory)).filter((file) => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
    const applied = new Map((await client.query('SELECT version,checksum FROM platform.schema_migrations')).rows.map((row) => [row.version, row.checksum]));
    for (const version of applied.keys()) if (!files.includes(version)) throw new Error('UNKNOWN_APPLIED_MIGRATION');
    for (const version of files) {
      const sql = await readFile(path.join(directory, version), 'utf8');
      const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
      if (applied.has(version)) {
        if (applied.get(version) !== checksum) throw new Error('MIGRATION_CHECKSUM_MISMATCH');
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO platform.schema_migrations(version,checksum) VALUES($1,$2)', [version, checksum]);
      console.log(`Migración aplicada: ${version}`);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
module.exports = { applyMigrations };
