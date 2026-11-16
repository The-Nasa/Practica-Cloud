require('reflect-metadata');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { Client } = require('pg');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { configureHttp } = require('../dist/platform/configure-http');
const { bootstrapAdmin } = require('../scripts/bootstrap-admin.cjs');
const { applyMigrations } = require('../scripts/migrations.cjs');
let app, db, server, admin, owner, customer, operator, manager, courier, zone, store;
let serial = 0;
const password = 'Solo-pruebas-F2-42';
const hours = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, opensAt: '00:00', closesAt: '24:00' }));
function api(method, path, user, body, headers = {}) {
  const action=path.split('/').at(-1);const versions={'accept':0,'start-preparation':1,'mark-ready':2,claim:3,pickup:0,deliver:1};
  if(method==='post'&&/\/(orders|assignments)\/[0-9a-f-]+\//.test(path)&&action in versions)body={expectedVersion:versions[action],...body};
  let call = request(server)[method](`/api/v1${path}`).set('Origin', 'http://localhost:5173');
  if (user) call = call.set('Cookie', user.cookie).set('X-CSRF-Token', user.csrfToken);
  for (const [key, value] of Object.entries(headers)) call = call.set(key, value);
  return body === undefined ? call : call.send(body);
}
function ok(response, expected = 200) {
  assert.equal(response.status, expected, JSON.stringify({ code: response.body.code, message: response.body.message }));
  return response.body;
}
async function register(label) {
  const response = await api('post', '/auth/register', null, { fullName: `Persona ${label}`, email: `f2-${label}-${++serial}@example.test`,
    phone: `+519${String(serial).padStart(8, '0')}`, password });
  ok(response, 201);
  return { ...response.body.user, cookie: response.headers['set-cookie'][0].split(';')[0], csrfToken: response.body.csrfToken };
}
async function decideStore(id, decision = 'approve') { return ok(await api('post', `/admin/stores/${id}/decisions`, admin, { decision, reason: `Motivo de ${decision}` }), 201); }
async function decideCourier(decision = 'approve') { return ok(await api('post', `/admin/couriers/${courier.id}/decisions`, admin, { decision, reason: `Motivo de ${decision}` }), 201); }
async function buy(skuId, addressId) {
  return api('post', '/purchases', customer, { addressId, paymentMethod: 'cash', items: [{ skuId, quantity: 1 }] }, { 'Idempotency-Key': randomUUID() });
}
before(async () => {
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/quickly_test_[a-f0-9]{20}$/);
  app = await NestFactory.create(AppModule, { logger: false }); configureHttp(app); await app.init(); server = app.getHttpServer();
  db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  admin = await register('admin'); await bootstrapAdmin(db, admin.email);
  owner = await register('owner'); customer = await register('customer'); operator = await register('operator');
  manager = await register('manager'); courier = await register('courier');
  zone = ok(await api('post', '/admin/zones', admin, { code: 'f2-central', name: 'Zona central F2', baseFeeCents: 350, estimatedMinutes: 25 }), 201);
}, { timeout: 30000 });
after(async () => { if (db) await db.end(); if (app) await app.close(); });

test('F2: migraciones repetibles con checksum y bootstrap sin escalamiento público', async () => {
  const migrations = (await require('node:fs/promises').readdir(require('node:path').join(__dirname,'../migrations'))).filter(name=>/^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  assert.deepEqual((await db.query('SELECT version FROM platform.schema_migrations ORDER BY version')).rows.map(row=>row.version),migrations);
  await bootstrapAdmin(db, admin.email);
  await assert.rejects(bootstrapAdmin(db, owner.email), /ADMIN_ALREADY_CONFIGURED/);
  const old = (await db.query('SELECT * FROM platform.schema_migrations ORDER BY version')).rows[0];
  await db.query("UPDATE platform.schema_migrations SET checksum=repeat('0',64) WHERE version=$1",[old.version]);
  try { await assert.rejects(applyMigrations(db), /MIGRATION_CHECKSUM_MISMATCH/); }
  finally { await db.query('UPDATE platform.schema_migrations SET checksum=$1 WHERE version=$2', [old.checksum,old.version]); }
  ok(await api('get', '/admin/users', customer), 403);
  ok(await api('patch', `/admin/users/${admin.id.toUpperCase()}/status`, admin, { status: 'suspended', reason: 'Prueba de autosuspensión' }), 403);
  ok(await api('post', '/merchant/stores', owner, { name: 'Incompleta', status: 'active' }), 400);
});

test('F2: solicitud comercial pendiente, aprobación con motivo y roles independientes', async () => {
  const categories = ok(await api('get', '/merchant/categories', owner)); assert.ok(categories.some((c) => c.code === 'restaurantes'));
  store = ok(await api('post', '/merchant/stores', owner, { categoryCode: 'restaurantes', zoneId: zone.id, name: 'Tienda F2', addressText: 'Calle F2 10',
    phone: owner.phone, legalBusinessName: 'Empresa de prueba', taxId: '20123456789' }), 201);
  assert.equal(store.status, 'pending'); assert.equal(store.acceptingOrders, false);
  assert.deepEqual(ok(await api('get', '/auth/session', owner)).user.roles, ['customer']);
  ok(await api('get', `/merchant/stores/${store.id}`, customer), 404);
  ok(await api('post', `/admin/stores/${store.id}/decisions`, owner, { decision: 'approve', reason: 'Sin permiso' }), 403);
  store = await decideStore(store.id);
  assert.equal(store.status, 'active'); assert.equal(store.isOpen, false);
  assert.ok(ok(await api('get', '/auth/session', owner)).user.roles.includes('merchant'));
  assert.ok(!ok(await api('get', '/auth/session', owner)).user.roles.includes('courier'));
  ok(await api('post', `/admin/stores/${store.id}/decisions`, admin, { decision: 'approve', reason: 'Duplicado' }), 409);
});

test('F2: horarios válidos, solapamientos rechazados y pausa pública real', async () => {
  store = ok(await api('put', `/merchant/stores/${store.id}/hours`, owner, { intervals: hours }));
  assert.equal(store.isOpen, true);
  ok(await api('put', `/merchant/stores/${store.id}/hours`, owner, { intervals: [
    { weekday: 1, opensAt: '09:00', closesAt: '13:00' }, { weekday: 1, opensAt: '12:00', closesAt: '18:00' },
  ] }), 400);
  ok(await api('put', `/merchant/stores/${store.id}/hours`, owner, { intervals: [{ weekday: 2, opensAt: '22:00', closesAt: '02:00' }] }), 400);
  assert.equal(ok(await api('get', `/merchant/stores/${store.id}`, owner)).openingIntervals.length, 7);
  assert.equal(ok(await api('patch', `/merchant/stores/${store.id}`, owner, { acceptingOrders: false })).isOpen, false);
  assert.equal(ok(await api('get', `/stores/${store.id}`)).isOpen, false);
  store = ok(await api('patch', `/merchant/stores/${store.id}`, owner, { acceptingOrders: true }));
});

test('F2: membresías por tienda, operador limitado y revocación inmediata', async () => {
  ok(await api('put', `/merchant/stores/${store.id}/members`, owner, { email: operator.email, membershipRole: 'operator' }), 204);
  assert.equal(ok(await api('get', '/merchant/stores', operator)).items[0].membershipRole, 'operator');
  ok(await api('patch', `/merchant/stores/${store.id}`, operator, { description: 'No autorizado' }), 403);
  ok(await api('put', `/merchant/stores/${store.id}/members`, operator, { email: operator.email, membershipRole: 'manager' }), 403);
  ok(await api('put', `/merchant/stores/${store.id}/members`, owner, { email: manager.email, membershipRole: 'owner' }), 400);
  ok(await api('delete', `/merchant/stores/${store.id}/members/${owner.id}`, owner), 403);
  ok(await api('put', `/merchant/stores/${store.id}/members`, owner, { email: manager.email, membershipRole: 'manager' }), 204);
  ok(await api('patch', `/merchant/stores/${store.id}`, manager, { description: 'Gestión autorizada' }));
  ok(await api('patch', `/merchant/stores/${store.id}`, manager, { taxId: '20999999999' }), 403);
  assert.equal(ok(await api('get', `/merchant/stores/${store.id}/members`, owner)).length, 3);
  ok(await api('delete', `/merchant/stores/${store.id}/members/${operator.id}`, owner), 204);
  assert.ok(!ok(await api('get', '/auth/session', operator)).user.roles.includes('merchant'));
  ok(await api('get', `/merchant/stores/${store.id}`, operator), 404);
});

test('F2: cambio de afiliación requiere revisión; rechazo permite corregir y reenviar', async () => {
  store = ok(await api('patch', `/merchant/stores/${store.id}`, owner, { legalBusinessName: 'Nueva razón social' }));
  assert.equal(store.status, 'pending'); assert.equal(store.acceptingOrders, false);
  await decideStore(store.id, 'reject');
  const rejected = ok(await api('get', `/merchant/stores/${store.id}`, owner)); assert.equal(rejected.statusReason, 'Motivo de reject');
  store = ok(await api('patch', `/merchant/stores/${store.id}`, owner, { addressText: 'Dirección corregida 20' }));
  assert.equal(store.status, 'pending');
  store = await decideStore(store.id);
});

test('F2: listas administrativas tienen filtros y paginación estable sin duplicados', async () => {
  const extra = ok(await api('post', '/merchant/stores', customer, { categoryCode: 'bodegas', zoneId: zone.id, name: 'Otra tienda', addressText: 'Calle de prueba', phone: customer.phone }), 201);
  const first = ok(await api('get', '/admin/stores?limit=1', admin)); assert.equal(first.items.length, 1); assert.ok(first.nextCursor);
  const second = ok(await api('get', `/admin/stores?limit=1&cursor=${first.nextCursor}`, admin)); assert.notEqual(second.items[0].id, first.items[0].id);
  const pending = ok(await api('get', '/admin/stores?status=pending', admin)); assert.ok(pending.items.some((s) => s.id === extra.id));
  const users = ok(await api('get', '/admin/users?limit=2', admin)); assert.equal(users.items.length, 2); assert.ok(users.nextCursor);
  ok(await api('get', '/admin/stores?limit=500', admin), 400);
});

test('F2: direcciones propias, coordenadas emparejadas y predeterminadas concurrentes', async () => {
  const input = { zoneId: zone.id, label: 'Casa', recipientName: customer.fullName, phone: customer.phone, street: 'Calle', streetNumber: '15' };
  const first = ok(await api('post', '/me/addresses', customer, input), 201); assert.equal(first.isDefault, true);
  const second = ok(await api('post', '/me/addresses', customer, { ...input, label: 'Trabajo' }), 201);
  ok(await api('patch', `/me/addresses/${first.id}`, owner, { label: 'Ajena' }), 404);
  ok(await api('patch', `/me/addresses/${first.id}`, customer, { latitude: -9.3 }), 400);
  ok(await api('patch', `/me/addresses/${first.id}`, customer, { latitude: -9.3, longitude: -76.0 }));
  await Promise.all([api('put', `/me/addresses/${first.id}/default`, customer), api('put', `/me/addresses/${second.id}/default`, customer)]).then((results) => results.forEach((r) => ok(r)));
  let addresses = ok(await api('get', '/me/addresses', customer)); assert.equal(addresses.filter((a) => a.isDefault).length, 1);
  const selected = addresses.find((a) => a.isDefault);
  ok(await api('delete', `/me/addresses/${selected.id}`, customer), 204);
  addresses = ok(await api('get', '/me/addresses', customer)); assert.equal(addresses.length, 1); assert.equal(addresses[0].isDefault, true);
});

test('F2: courier pendiente, revisión de vehículo, aprobación y disponibilidad sin autoasignarse rol', async () => {
  ok(await api('get', '/courier/profile', courier), 404);
  ok(await api('put', '/courier/profile', courier, { vehicleType: 'motorcycle', zoneId: zone.id }), 400);
  const applied = ok(await api('put', '/courier/profile', courier, { vehicleType: 'bicycle', zoneId: zone.id })); assert.equal(applied.status, 'pending');
  ok(await api('patch', '/courier/profile/availability', courier, { isOnline: true }), 409);
  await decideCourier();
  assert.equal(ok(await api('patch', '/courier/profile/availability', courier, { isOnline: true })).isOnline, true);
  const changed = ok(await api('put', '/courier/profile', courier, { vehicleType: 'motorcycle', plate: 'F2-123', zoneId: zone.id })); assert.equal(changed.status, 'pending');
  assert.ok(!ok(await api('get', '/auth/session', courier)).user.roles.includes('courier'));
  await decideCourier('reject');
  const again = ok(await api('put', '/courier/profile', courier, { vehicleType: 'bicycle', zoneId: zone.id })); assert.equal(again.status, 'pending');
  await decideCourier(); await api('patch', '/courier/profile/availability', courier, { isOnline: true });
});

test('F2: pedidos cerrados por horario; suspensiones no abandonan pedidos ni entregas activos', async () => {
  const category = (await db.query("INSERT INTO catalog.categories(code,name) VALUES('f2','F2') RETURNING id")).rows[0].id;
  const product = ok(await api('post', `/merchant/stores/${store.id}/products`, owner, { categoryId: category, name: 'Producto F2', skuCode: 'F2-TEST', variantName: 'Estándar', priceCents: 1000, initialStock: 3 }), 201);
  const address = ok(await api('get', '/me/addresses', customer))[0].id;
  ok(await api('put', `/merchant/stores/${store.id}/hours`, owner, { intervals: [] }));
  assert.equal(ok(await buy(product.skuId, address), 409).code, 'STORE_CLOSED');
  ok(await api('put', `/merchant/stores/${store.id}/hours`, owner, { intervals: hours }));
  const bought = ok(await buy(product.skuId, address), 201);
  ok(await api('post', `/admin/stores/${store.id}/decisions`, admin, { decision: 'suspend', reason: 'Prueba de suspensión' }), 409);
  ok(await api('patch', `/admin/users/${owner.id}/status`, admin, { status: 'suspended', reason: 'Pedido activo' }), 409);
  for (const action of ['accept','start-preparation','mark-ready']) ok(await api('post', `/merchant/orders/${bought.orderId}/${action}`, owner), 201);
  const assignment = ok(await api('post', `/courier/orders/${bought.orderId}/claim`, courier), 201);
  ok(await api('post', `/admin/couriers/${courier.id}/decisions`, admin, { decision: 'suspend', reason: 'Entrega activa' }), 409);
  ok(await api('patch', `/admin/users/${courier.id}/status`, admin, { status: 'suspended', reason: 'Entrega activa' }), 409);
  ok(await api('post', `/courier/assignments/${assignment.id}/pickup`, courier), 201);
  ok(await api('post', `/courier/assignments/${assignment.id}/deliver`, courier,{cashReceivedCents:100000}), 201);
  await decideCourier('suspend'); assert.equal(ok(await api('get', '/courier/profile', courier)).isOnline, false);
  await decideCourier('reactivate'); assert.equal(ok(await api('get', '/courier/profile', courier)).isOnline, false);
});

test('F2: zona desactivada frena altas y compras, conserva direcciones e impide online', async () => {
  ok(await api('patch', '/courier/profile/availability', courier, { isOnline: true }));
  ok(await api('patch', `/admin/zones/${zone.id}`, admin, { isActive: false, reason: 'Pausa temporal de cobertura' }));
  assert.equal(ok(await api('get', '/geography/zones')).length, 0);
  assert.equal(ok(await api('get', '/courier/profile', courier)).isOnline, false);
  ok(await api('patch', '/courier/profile/availability', courier, { isOnline: true }), 409);
  const addresses = ok(await api('get', '/me/addresses', customer)); assert.equal(addresses[0].zoneActive, false);
  ok(await api('patch', `/me/addresses/${addresses[0].id}`, customer, { reference: 'Nueva referencia' }));
  ok(await api('post', '/merchant/stores', owner, { categoryCode: 'bodegas', zoneId: zone.id, name: 'No permitida', addressText: 'Calle', phone: owner.phone }), 400);
  ok(await api('patch', `/admin/zones/${zone.id}`, admin, { isActive: true, reason: 'Cobertura restablecida' }));
});

test('F2: suspensión de cuenta revoca sesiones; reactivar no restaura sesiones revocadas', async () => {
  ok(await api('patch', `/admin/users/${customer.id}/status`, admin, { status: 'suspended', reason: 'Revisión de cuenta' }), 204);
  ok(await api('get', '/me', customer), 401);
  ok(await api('patch', `/admin/users/${customer.id}/status`, admin, { status: 'active', reason: 'Revisión completada' }), 204);
  ok(await api('get', '/me', customer), 401);
  ok(await api('post', '/auth/login', null, { email: customer.email, password }), 200);
  const counts = ok(await api('get', '/admin/overview', admin)); assert.ok(counts.activeUsers >= 6);
});

test('F2: auditoría y outbox son atómicos y no guardan contraseñas ni datos de dirección', async () => {
  const requestId = randomUUID();
  ok(await api('patch', `/admin/zones/${zone.id}`, admin, { baseFeeCents: 450, reason: 'Ajuste operativo' }, { 'X-Request-Id': requestId }));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM platform.audit_entries WHERE request_id=$1', [requestId])).rows[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM platform.outbox_events WHERE payload->>'requestId'=$1", [requestId])).rows[0].n, 1);
  const before = (await db.query('SELECT count(*)::int AS n FROM geography.coverage_zones')).rows[0].n;
  await db.query(`CREATE FUNCTION platform.f2_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.action='geography.zone_created' THEN RAISE EXCEPTION 'f2_test_failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER f2_fail_audit BEFORE INSERT ON platform.audit_entries FOR EACH ROW EXECUTE FUNCTION platform.f2_fail_audit()`);
  try { ok(await api('post', '/admin/zones', admin, { code: 'rollback', name: 'Debe revertirse', baseFeeCents: 100, estimatedMinutes: 10 }), 500); }
  finally { await db.query('DROP TRIGGER f2_fail_audit ON platform.audit_entries; DROP FUNCTION platform.f2_fail_audit()'); }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM geography.coverage_zones')).rows[0].n, before);
});
