require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { Client } = require('pg');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { configureHttp } = require('../dist/platform/configure-http');
let app, db, server, owner, other, purchaseId, emptyPurchaseId, sequence = 0;
function get(path, user) {
  const call = request(server).get(`/api/v1${path}`);
  return user ? call.set('Cookie', user.cookie) : call;
}
async function register(label) {
  const r = await request(server).post('/api/v1/auth/register').set('Origin', 'http://localhost:5173')
    .send({ fullName: `Persona ${label}`, email: `${randomUUID()}@example.test`, phone: `+519${String(++sequence).padStart(8, '0')}`, password: 'Solo-pruebas-F6-42' });
  assert.equal(r.status, 201);
  return { id: r.body.user.id, cookie: r.headers['set-cookie'][0].split(';')[0] };
}
before(async () => {
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/quickly_test_[a-f0-9]{20}$/);
  app = await NestFactory.create(AppModule, { logger: false }); configureHttp(app); await app.init();
  server = app.getHttpServer(); db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  owner = await register('titular'); other = await register('otra cuenta');
  purchaseId = (await db.query('INSERT INTO ordering.purchases(customer_id) VALUES($1) RETURNING id', [owner.id])).rows[0].id;
  emptyPurchaseId = (await db.query('INSERT INTO ordering.purchases(customer_id) VALUES($1) RETURNING id', [owner.id])).rows[0].id;
  for (let i = 0; i < 3; i++) {
    const id = (await db.query(`INSERT INTO billing.payment_attempts(purchase_id,method_code,provider,provider_reference,amount_cents)
      VALUES($1,'cash','cash',$2,1350) RETURNING id`, [purchaseId, `private-reference-${i}`])).rows[0].id;
    if (i === 0) await db.query("UPDATE billing.payment_attempts SET status='failed' WHERE id=$1", [id]);
  }
}, { timeout: 30000 });
after(async () => { if (db) await db.end(); if (app) await app.close(); });

test('F6 base: catálogo no confunde métodos existentes con integración digital habilitada', async () => {
  const r = await get('/payment-methods'); assert.equal(r.status, 200);
  assert.deepEqual(r.body.filter(m => m.available).map(m => m.code), ['cash']);
  for (const m of r.body.filter(m => m.code !== 'cash')) assert.equal(typeof m.unavailableReason, 'string');
});
test('F6 base: historial exige sesión y pertenece exclusivamente al comprador', async () => {
  assert.equal((await get(`/me/purchases/${purchaseId}/payments`)).status, 401);
  assert.equal((await get(`/me/purchases/${purchaseId}/payments`, other)).status, 404);
  assert.equal((await get(`/me/purchases/${randomUUID()}/payments`, owner)).status, 404);
});
test('F6 base: pagos paginados mantienen estados, importes y no exponen referencias externas', async () => {
  let cursor; const items = [];
  do {
    const r = await get(`/me/purchases/${purchaseId}/payments?limit=1${cursor ? `&cursor=${cursor}` : ''}`, owner);
    assert.equal(r.status, 200); assert.equal(r.headers['cache-control'], 'no-store');
    items.push(...r.body.items); cursor = r.body.nextCursor;
  } while (cursor);
  assert.equal(items.length, 3); assert.equal(new Set(items.map(i => i.id)).size, 3);
  assert.equal(items.filter(i => i.status === 'failed').length, 1);
  for (const item of items) {
    assert.equal(item.amountCents, 1350); assert.equal(item.succeededAt, null); assert.deepEqual(item.refunds, []);
    assert.equal('providerReference' in item, false); assert.equal('provider_reference' in item, false);
    assert.equal('collectedByUserId' in item, false); assert.ok(!Number.isNaN(Date.parse(item.createdAt)));
  }
});
test('F6 base: compra propia sin intentos devuelve vacío; entradas inválidas se rechazan', async () => {
  const r = await get(`/me/purchases/${emptyPurchaseId}/payments`, owner);
  assert.equal(r.status, 200); assert.deepEqual(r.body, { items: [], nextCursor: null });
  for (const suffix of ['?limit=101', '?limit=0', '?cursor=invalido']) {
    assert.equal((await get(`/me/purchases/${purchaseId}/payments${suffix}`, owner)).status, 400);
  }
  assert.equal((await get('/me/purchases/invalido/payments', owner)).status, 400);
});
test('F6 base: leer pagos no crea cobros, webhooks, reembolsos ni eventos', async () => {
  const sql = `SELECT (SELECT count(*) FROM billing.payment_attempts) AS payments,
    (SELECT count(*) FROM billing.refunds) AS refunds,(SELECT count(*) FROM billing.webhook_receipts) AS webhooks,
    (SELECT count(*) FROM platform.outbox_events) AS events`;
  const before = (await db.query(sql)).rows[0];
  await get(`/me/purchases/${purchaseId}/payments`, owner); await get('/payment-methods');
  assert.deepEqual((await db.query(sql)).rows[0], before);
});
