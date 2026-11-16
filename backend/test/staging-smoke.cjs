// Isolated localhost-only HTTPS rehearsal. Never uses .env or the development compose project.
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const { deflateSync } = require('node:zlib');
const backend = path.resolve(__dirname, '..');
const project = `quickly-f8-${randomBytes(6).toString('hex')}`;
const envFile = path.resolve(backend, `../.tmp/${project}.env`);
const composeFile = path.join(backend, 'deploy/compose.staging.yml');
const base = 'https://localhost:18443';
let stage = 'setup';
function png(){const chunk=(type,data)=>{const bytes=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,bytes,sum]);};const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);}
function compose(args, capture = false) {
  assert.match(project, /^quickly-f8-[a-f0-9]{12}$/);
  const result = spawnSync('docker', ['compose', '--project-name', project, '--env-file', envFile, '-f', composeFile, ...args],
    { cwd: backend, windowsHide: true, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8', timeout: 600000 });
  if (result.error || result.status !== 0) throw new Error('STAGING_COMPOSE_FAILED');
  return capture ? result.stdout.trim() : '';
}
(async () => {
  let browser, page, started = false;
  try {
    await fs.mkdir(path.dirname(envFile), { recursive: true });
    await fs.writeFile(envFile, `STAGING_DB_PASSWORD=${randomBytes(24).toString('hex')}\nSTAGING_APP_PASSWORD=${randomBytes(24).toString('hex')}\nSITE_ADDRESS=https://localhost\nSITE_ORIGIN=${base}\nSTAGING_DB_PORT=25434\nHTTP_BIND=127.0.0.1:18080\nHTTPS_BIND=127.0.0.1:18443\nRELEASE_TAG=f8-validation\n`, { flag: 'wx', mode: 0o600 });
    assert.equal(compose(['ps', '-aq'], true), '', 'El proyecto temporal debe ser nuevo');
    compose(['config', '--quiet']);
    if (!process.argv.includes('--skip-build')) compose(['build', 'api', 'web']);
    stage = 'start-containers'; started = true; compose(['up', '-d', '--wait', '--wait-timeout', '180']);
    stage = 'restricted-runtime-role';
    compose(['exec','-T','api','node','-e',`const {Client}=require('pg');const c=new Client({host:process.env.DATABASE_HOST,user:process.env.DATABASE_USER,password:process.env.DATABASE_PASSWORD,database:process.env.DATABASE_NAME});(async()=>{try{await c.connect();const r=(await c.query("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,has_schema_privilege(current_user,'identity','CREATE') AS ddl FROM pg_roles WHERE rolname=current_user")).rows[0];if(r.rolname!=='quickly_app'||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.ddl)throw Error('Invalid runtime role');console.log('Rol runtime restringido verificado.');}finally{await c.end()}})().catch(()=>process.exitCode=1)`]);
    const { chromium } = require(path.resolve(backend, '../Frontend-Quickly/node_modules/@playwright/test'));
    const edge = process.platform === 'win32' && existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
    browser = await chromium.launch({ headless: true, ...(edge ? { channel: 'msedge' } : {}) });
    // Only this localhost test context accepts the temporary internal CA. No global TLS bypass.
    const context = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true });
    page = await context.newPage(); page.setDefaultTimeout(20000);
    const email = `${project}@example.test`, password = randomBytes(20).toString('hex');
    stage = 'register-through-https'; await page.goto('/registro');
    await page.getByLabel('Nombres y apellidos').fill('Persona ensayo HTTPS');
    await page.getByLabel('Correo electrónico').fill(email); await page.getByLabel('Celular').fill('999999111');
    await page.getByLabel(/^Contraseña/).fill(password); await page.getByRole('button', { name: 'Crear mi cuenta', exact: true }).click();
    await page.waitForURL('**/cliente/perfil');
    stage = 'secure-session'; const cookie = (await context.cookies()).find(c => c.name === 'quickly_session');
    assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Lax');
    await page.reload(); await page.getByRole('heading', { name: /perfil/i }).first().waitFor();
    const ready = await page.request.get('/api/v1/health/ready'); assert.equal(ready.status(), 200);
    assert.equal(ready.headers()['x-content-type-options'], 'nosniff');
    const denied = await page.request.post('/api/v1/auth/logout', { headers: { Origin: base } }); assert.equal(denied.status(), 403);
    const unknown = await page.request.get('/api/v1/not-a-real-route'); assert.equal(unknown.status(), 404); assert.ok(unknown.headers()['content-type'].includes('json'));
    const spa = await page.request.get('/cliente/perfil'); assert.equal(spa.status(), 200); assert.ok(spa.headers()['content-type'].includes('text/html'));
    assert.ok(spa.headers()['content-security-policy'].includes("frame-ancestors 'none'"));
    stage = 'bootstrap-administration'; compose(['exec', '-T', 'api', 'node', 'scripts/bootstrap-admin.cjs', '--email', email]);
    stage = 'administration-monitor';
    await page.goto('/admin/operacion'); await page.getByRole('heading', { name: 'Estado operativo', exact: true }).waitFor();
    await page.getByText(/Eventos pendientes:/).waitFor();
    const beforeRestart = await (await page.request.get('/api/v1/auth/session')).json();
    stage = 'upload-persistent-media'; const uploaded = await page.request.put('/api/v1/me/avatar', {headers:{Origin:base,'X-CSRF-Token':beforeRestart.csrfToken},data:{content:png().toString('base64')}});
    assert.equal(uploaded.status(),200); const imageUrl = (await uploaded.json()).url;
    stage = 'restart-api'; compose(['restart','api']);
    let available=false;
    for(let i=0;i<40;i++){
      try{available=(await page.request.get('/api/v1/health/ready')).status()===200;}catch{}
      if(available)break;await new Promise(resolve=>setTimeout(resolve,1000));
    }
    assert.ok(available,'API debe recuperar readiness tras reinicio');
    const image = await page.request.get(imageUrl); assert.equal(image.status(),200);assert.deepEqual(await image.body(),png());
    await page.reload();await page.getByRole('heading',{name:'Estado operativo',exact:true}).waitFor();
    stage = 'logout'; const session = await (await page.request.get('/api/v1/auth/session')).json();
    assert.equal((await page.request.post('/api/v1/auth/logout', { headers: { Origin: base, 'X-CSRF-Token': session.csrfToken } })).status(), 204);
    assert.equal((await page.request.get('/api/v1/auth/session')).status(),401);
    console.log('HTTPS local aprobado: SPA/proxy, cookie Secure HttpOnly, recarga, CSRF, CSP, monitoreo, sesión/imagen persistentes tras reinicio y logout. No acredita certificado público ni piloto.');
  } catch (error) {
    console.error(`Paso del ensayo HTTPS incompleto: ${stage}`);
    if(stage==='start-containers') { try { console.error(compose(['logs','--no-color','migrate','provision'],true)); } catch {} }
    if (page) { console.error('Ruta: '+new URL(page.url()).pathname); console.error('Pantalla: '+(await page.locator('h1').allTextContents().catch(()=>[])).join(' | ')); await page.screenshot({path:path.resolve(backend,`../.tmp/${project}-failure.png`)}).catch(()=>{}); }
    throw new Error('HTTPS_SMOKE_FAILED');
  } finally {
    if (browser) await browser.close();
    // Only the newly generated project and its unnamed scoped volumes; never development/staging volumes.
    try { if (started) compose(['down', '--volumes', '--remove-orphans']); }
    finally { await fs.unlink(envFile).catch(() => {}); }
  }
})().catch(() => { console.error('Ensayo HTTPS incompleto. No se imprimen credenciales; revisar los servicios del proyecto temporal indicado.'); process.exitCode = 1; });
