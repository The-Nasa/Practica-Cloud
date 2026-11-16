const fs = require('node:fs/promises');
const { createReadStream, openSync, closeSync } = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { Client } = require('pg');
const objectKey = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/;
const references = `SELECT object_key FROM catalog.product_images UNION SELECT avatar_object_key FROM identity.users WHERE avatar_object_key IS NOT NULL
 UNION SELECT logo_object_key FROM merchant.stores WHERE logo_object_key IS NOT NULL UNION SELECT banner_object_key FROM merchant.stores WHERE banner_object_key IS NOT NULL`;
async function checksum(file) { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
function pgTool(tool, args, url, container, { input, output } = {}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(container)) throw new Error('INVALID_POSTGRES_CONTAINER');
  const connection = new URL(url);
  const inFd = input ? openSync(input, 'r') : undefined, outFd = output ? openSync(output, 'wx', 0o600) : undefined;
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', ...(input ? ['-i'] : []), '--env', 'PGPASSWORD', '--env', 'PGOPTIONS', container,
      tool, '--host', '127.0.0.1', '--username', decodeURIComponent(connection.username), '--dbname', decodeURIComponent(connection.pathname.slice(1)), ...args],
      { windowsHide: true, env: { ...process.env, PGPASSWORD: decodeURIComponent(connection.password), PGOPTIONS: '-c lock_timeout=10000 -c statement_timeout=120000' },
        stdio: [inFd ?? 'ignore', outFd ?? 'ignore', 'pipe'] });
    // Consume without printing SQL, connection strings or credentials.
    child.stderr.on('data', () => {});
    child.on('error', () => reject(new Error('POSTGRES_TOOL_UNAVAILABLE')));
    child.on('close', code => { if (inFd !== undefined) closeSync(inFd); if (outFd !== undefined) closeSync(outFd); code === 0 ? resolve() : reject(new Error('POSTGRES_TOOL_FAILED')); });
  });
}
async function assertRegular(file) { if (!(await fs.lstat(file)).isFile()) throw new Error('BACKUP_REQUIRES_REGULAR_FILES'); }
async function createBackup({ connectionString, container, mediaRoot, outputDir, maintenanceConfirmed = false }) {
  if (!maintenanceConfirmed) throw new Error('MAINTENANCE_REQUIRED');
  const directory = path.resolve(outputDir), media = path.resolve(mediaRoot);
  if (directory === media || directory.startsWith(media + path.sep)) throw new Error('INVALID_BACKUP_DIRECTORY');
  // Never overwrite an existing backup, even after a failed attempt.
  await fs.mkdir(directory, { mode: 0o700 }); await fs.mkdir(path.join(directory, 'media'), { mode: 0o700 });
  const db = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await db.connect(); await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ'); await db.query("SET LOCAL lock_timeout='5s'");
    const tables = (await db.query(`SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN
      ('identity','geography','merchant','catalog','ordering','inventory','billing','delivery','support','platform') ORDER BY schemaname,tablename`)).rows;
    if (!tables.length) throw new Error('BASELINE_REQUIRED');
    const ident = text => '"' + text.replace(/"/g, '""') + '"';
    // Reads/pg_dump remain possible; all business writes and DDL are excluded for DB + media consistency.
    await db.query(`LOCK TABLE ${tables.map(t => `${ident(t.schemaname)}.${ident(t.tablename)}`).join(',')} IN SHARE MODE`);
    const migrations = (await db.query('SELECT version,checksum FROM platform.schema_migrations ORDER BY version')).rows;
    const keys = (await db.query(references)).rows.map(r => r.object_key).sort();
    const objects = [];
    for (const key of keys) {
      if (!objectKey.test(key)) throw new Error('INVALID_MEDIA_REFERENCE');
      const source = path.join(media, key); await assertRegular(source);
      const destination = path.join(directory, 'media', key); await fs.copyFile(source, destination);
      objects.push({ key, sha256: await checksum(destination) });
    }
    const dump = path.join(directory, 'database.dump');
    const snapshot = (await db.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
    await pgTool('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--snapshot=${snapshot}`], connectionString, container, { output: dump });
    const version = (await db.query('SHOW server_version')).rows[0].server_version;
    await db.query('COMMIT');
    const manifest = { format: 'quickly-backup-v1', createdAt: new Date().toISOString(), postgresVersion: version,
      migrations, dumpSha256: await checksum(dump), objects };
    // Manifest written last: incomplete directories are never valid backups.
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    return { directory, objects: objects.length };
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await db.end(); }
}
async function verifyBackup(directory) {
  const root = path.resolve(directory); await assertRegular(path.join(root, 'manifest.json'));
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'quickly-backup-v1' || !Array.isArray(manifest.objects) || manifest.objects.length > 100000 || !Array.isArray(manifest.migrations)) throw new Error('INVALID_BACKUP');
  const dump = path.join(root, 'database.dump'); await assertRegular(dump);
  if (await checksum(dump) !== manifest.dumpSha256) throw new Error('BACKUP_CHECKSUM_MISMATCH');
  const seen = new Set();
  for (const entry of manifest.objects) {
    if (!objectKey.test(entry.key) || seen.has(entry.key)) throw new Error('INVALID_BACKUP_OBJECT'); seen.add(entry.key);
    const file = path.join(root, 'media', entry.key); await assertRegular(file);
    if (await checksum(file) !== entry.sha256) throw new Error('BACKUP_CHECKSUM_MISMATCH');
  }
  return manifest;
}
async function restoreBackup({ directory, adminUrl, container, targetMediaRoot }) {
  const url = new URL(adminUrl);
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.pathname !== '/postgres') throw new Error('LOCAL_ADMIN_DATABASE_REQUIRED');
  const manifest = await verifyBackup(directory);
  const name = `quickly_restore_${randomBytes(10).toString('hex')}`;
  // mkdir without recursive/overwrite; an existing operational media directory is rejected.
  const media = path.resolve(targetMediaRoot); await fs.mkdir(media, { mode: 0o700 });
  const admin = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  let created = false;
  try {
    await admin.connect(); await admin.query(`CREATE DATABASE "${name}"`); created = true;
    const target = new URL(adminUrl); target.pathname = `/${name}`;
    await pgTool('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges'], target.toString(), container,
      { input: path.join(path.resolve(directory), 'database.dump') });
    for (const entry of manifest.objects) await fs.copyFile(path.join(path.resolve(directory), 'media', entry.key), path.join(media, entry.key));
    const restored = new Client({ connectionString: target.toString() });
    try {
      await restored.connect();
      const versions = (await restored.query('SELECT version,checksum FROM platform.schema_migrations ORDER BY version')).rows;
      if (JSON.stringify(versions) !== JSON.stringify(manifest.migrations)) throw new Error('RESTORE_MIGRATION_MISMATCH');
      const keys = (await restored.query(references)).rows.map(r => r.object_key).sort();
      if (JSON.stringify(keys) !== JSON.stringify(manifest.objects.map(o => o.key).sort())) throw new Error('RESTORE_MEDIA_MISMATCH');
      // A disaster recovery must not revive pre-backup browser sessions.
      await restored.query('BEGIN');
      try {
        await restored.query('UPDATE identity.sessions SET revoked_at=now() WHERE revoked_at IS NULL');
        await restored.query(`INSERT INTO platform.audit_entries(actor_user_id,action,entity_type,entity_id,request_id,details)
          VALUES(NULL,'platform.restore_completed','recovery',gen_random_uuid(),gen_random_uuid(),$1)`, [JSON.stringify({ objects: manifest.objects.length })]);
        await restored.query('COMMIT');
      } catch (error) { await restored.query('ROLLBACK'); throw error; }
    } finally { await restored.end(); }
    return { database: name, mediaRoot: media, objects: manifest.objects.length };
  } catch (error) {
    if (created && /^quickly_restore_[a-f0-9]{20}$/.test(name)) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`).catch(() => {});
    throw error;
  } finally { await admin.end(); }
}
module.exports = { createBackup, verifyBackup, restoreBackup };
if (require.main === module) {
  require('dotenv').config();
  (async () => {
    const action = process.argv[2], directory = process.argv[3];
    if (!directory) throw new Error('BACKUP_DIRECTORY_REQUIRED');
    if (action === 'create') console.log(JSON.stringify(await createBackup({ connectionString: process.env.DATABASE_URL,
      container: process.env.POSTGRES_CONTAINER || 'quickly-postgres', mediaRoot: process.env.MEDIA_ROOT || '.media', outputDir: directory,
      maintenanceConfirmed: process.argv.includes('--maintenance') })));
    else if (action === 'verify') { await verifyBackup(directory); console.log('Respaldo íntegro.'); }
    else if (action === 'restore') {
      if (!process.env.RESTORE_ADMIN_URL || !process.argv[4]) throw new Error('RESTORE_TARGET_REQUIRED');
      console.log(JSON.stringify(await restoreBackup({ directory, adminUrl: process.env.RESTORE_ADMIN_URL,
        container: process.env.POSTGRES_CONTAINER || 'quickly-postgres', targetMediaRoot: process.argv[4] })));
    } else throw new Error('INVALID_BACKUP_ACTION');
  })().catch(error => { console.error(`Operación de respaldo incompleta (${/^[A-Z_]+$/.test(error.message) ? error.message : 'BACKUP_FAILED'}). No se sobrescribió una base existente.`); process.exitCode = 1; });
}
