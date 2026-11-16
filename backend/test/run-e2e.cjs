const { Client } = require('pg');
const { randomBytes, randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { applyMigrations } = require('../scripts/migrations.cjs');
const { bootstrapAdmin } = require('../scripts/bootstrap-admin.cjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function suite(admin, adminUrl, file, browser) {
  const databaseName = `quickly_test_${randomBytes(10).toString('hex')}`;
  let created = false;
  let db;
  const mediaRoot = await mkdtemp(path.join(tmpdir(), 'quickly-test-media-'));
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`); created = true;
    const testUrl = new URL(adminUrl); testUrl.pathname = `/${databaseName}`;
    db = new Client({ connectionString: testUrl.toString() }); await db.connect();
    await db.query(await readFile(path.join(__dirname, '../001_schema.sql'), 'utf8'));
    await db.query(await readFile(path.join(__dirname, '../002_verificar.sql'), 'utf8'));
    await applyMigrations(db); await applyMigrations(db);
    const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: testUrl.toString(), DATABASE_HOST: '127.0.0.1', DATABASE_SSL: 'false', MEDIA_ROOT: mediaRoot };
    if (browser) {
      // Synthetic, isolated credentials. No admin is seeded into the development database.
      const { PasswordHasher } = require('../dist/modules/identity/domain/password.service');
      const email = `admin-${randomUUID()}@example.test`;
      const password = randomBytes(24).toString('hex');
      const hash = await new PasswordHasher().hash(password);
      const user = (await db.query(`INSERT INTO identity.users(full_name,email,phone) VALUES('Admin de pruebas',$1,'+51999999111') RETURNING id`, [email])).rows[0];
      await db.query('INSERT INTO identity.password_credentials(user_id,password_hash) VALUES($1,$2)', [user.id, hash]);
      await bootstrapAdmin(db, email);
      Object.assign(env, { CORS_ORIGIN: 'http://localhost:5174', SESSION_COOKIE_SECURE: 'false',
        BROWSER_ADMIN_EMAIL: email, BROWSER_ADMIN_PASSWORD: password });
    }
    console.log(`${browser ? 'Navegador' : file}: baseline, SQL y migraciones preparados en DB aislada.`);
    await db.end(); db = undefined;
    const frontend = path.join(__dirname, '../../Frontend-Quickly');
    const spec=process.argv.find(value=>value.startsWith('--spec='))?.slice(7);
    if(spec && spec !== 'original-integral.spec.ts') throw new Error('Use original-integral.spec.ts: los specs anteriores usan selectores de pantallas retiradas');
    const args = browser ? [path.join(frontend, 'node_modules/@playwright/test/cli.js'), 'test', '--config', path.join(frontend, 'playwright.config.ts'),...(spec?[spec]:[])]
      : ['--test', '--test-concurrency=1', path.join(__dirname, file)];
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true, cwd: browser ? frontend : path.join(__dirname, '..'), env });
      child.on('error', reject); child.on('exit', (exitCode) => resolve(exitCode ?? 1));
    });
    if (code !== 0) throw new Error('TEST_FAILURE');
  } finally {
    try { if (db) await db.end(); }
    finally {
      try { if (created) { await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); console.log('DB temporal eliminada.'); } }
      finally {
        if (path.dirname(path.resolve(mediaRoot)) !== path.resolve(tmpdir()) || !/^quickly-test-media-[A-Za-z0-9]+$/.test(path.basename(mediaRoot)))
          throw new Error('UNSAFE_MEDIA_TEST_CLEANUP');
        await rm(mediaRoot, { recursive: true, force: true });
      }
    }
  }
}
async function main() {
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL_REQUIRED');
  const url = new URL(process.env.TEST_DATABASE_URL);
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.pathname !== '/postgres') throw new Error('LOCAL_TEST_SERVER_REQUIRED');
  const admin = new Client({ connectionString: url.toString() });
  try {
    await admin.connect();
    if (process.argv.includes('--browser')) await suite(admin, url, '', true);
    else {
      const requested=process.argv.find(value=>value.startsWith('--suite='))?.slice(8);
      if(requested&&!['f0','f2','f3','f4','f5','f6','f7','f8'].includes(requested))throw new Error('INVALID_TEST_SUITE');
      for (const file of requested ? [`${requested}.e2e.cjs`] : ['f0.e2e.cjs', 'f2.e2e.cjs', 'f3.e2e.cjs','f4.e2e.cjs','f5.e2e.cjs','f6.e2e.cjs','f7.e2e.cjs','f8.e2e.cjs']) await suite(admin, url, file, false);
    }
  } finally { await admin.end(); }
}
main().catch((error) => {
  console.error(`Falló el harness (${error.code || error.message || 'TEST_FAILURE'}). Consulte test/README.md; no se imprimen credenciales.`);
  process.exitCode = 1;
});
