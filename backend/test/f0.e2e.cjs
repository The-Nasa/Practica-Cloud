require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { Client } = require('pg');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { configureHttp } = require('../dist/platform/configure-http');
const { PlatformService } = require('../dist/modules/platform/application/platform.service');

let app, db, server, customer, other, owner, outsider, admin, courier, courier2, zoneId, categoryId, storeId;
let sequence = 0;
const password = 'Solo-pruebas-locales-42';

function api(method, route, user, data, headers = {}) {
  // Established fixture transitions now send the required F4 concurrency version.
  const action=route.split('/').at(-1);
  const versions={'accept':0,'start-preparation':1,'mark-ready':2,claim:3,pickup:0,deliver:1,cancellations:0};
  if(method==='post'&&/\/(orders|assignments)\/[0-9a-f-]+\//.test(route)&&action in versions)data={expectedVersion:versions[action],...data};
  let call = request(server)[method](`/api/v1${route}`);
  call = call.set('Origin', 'http://localhost:5173');
  if (user) call = call.set('Cookie', user.sessionCookie).set('X-CSRF-Token', user.csrfToken);
  for (const [key, value] of Object.entries(headers)) call = call.set(key, value);
  return data === undefined ? call : call.send(data);
}
function status(response, expected) {
  assert.equal(response.status, expected, `HTTP ${response.status}: ${JSON.stringify({ code: response.body.code, message: response.body.message })}`);
  return response.body;
}
async function register(label) {
  sequence++;
  const response = await api('post', '/auth/register', null, {
    fullName: `Prueba ${label}`, email: `${label}${sequence}@example.test`,
    phone: `+519${String(sequence).padStart(8, '0')}`, password,
  });
  status(response, 201);
  return signedIn(response);
}
function signedIn(response) {
  assert.equal('sessionToken' in response.body, false);
  return { ...response.body.user, userId: response.body.user.id, csrfToken: response.body.csrfToken,
    sessionCookie: response.headers['set-cookie'][0].split(';')[0] };
}
async function address(user, isDefault = false) {
  return status(await api('post', '/me/addresses', user, {
    zoneId, label: 'Prueba', recipientName: user.fullName,
    phone: user.phone, street: 'Calle de prueba', streetNumber: '10', isDefault,
  }), 201).id;
}
async function product(stock = 5, priceCents = 1000, targetStore = storeId) {
  return status(await api('post', `/merchant/stores/${targetStore}/products`, owner, {
    categoryId, name: 'Producto real de pruebas', skuCode: `TEST-${randomUUID()}`,
    variantName: 'Estándar', priceCents, initialStock: stock,
  }), 201);
}
async function purchase(user = customer, sku, quantity = 1, key = randomUUID(), addressId = user.addressId) {
  return api('post', '/purchases', user, { addressId, paymentMethod: 'cash', items: [{ skuId: sku, quantity }] }, { 'Idempotency-Key': key });
}
async function readyOrder() {
  const item = await product();
  const bought = status(await purchase(customer, item.skuId), 201);
  for (const action of ['accept', 'start-preparation', 'mark-ready']) {
    status(await api('post', `/merchant/orders/${bought.orderId}/${action}`, owner), 201);
  }
  return { ...bought, skuId: item.skuId };
}

before(async () => {
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/quickly_test_[a-f0-9]{20}$/);
  app = await NestFactory.create(AppModule, { logger: false });
  configureHttp(app);
  await app.init();
  server = app.getHttpServer();
  db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  zoneId = (await db.query(`INSERT INTO geography.coverage_zones
    (code,name,base_fee_cents,estimated_minutes) VALUES ('test','Zona de prueba',300,20) RETURNING id`)).rows[0].id;
  categoryId = (await db.query(`INSERT INTO catalog.categories (code,name) VALUES ('test','Categoría de prueba') RETURNING id`)).rows[0].id;
  customer = await register('cliente');
  other = await register('otro');
  owner = await register('comercio');
  outsider = await register('ajeno');
  admin = await register('admin');
  courier = await register('repartidor');
  courier2 = await register('repartidor');
  await db.query(`INSERT INTO identity.user_roles (user_id,role_code) VALUES ($1,'admin'),($2,'courier'),($3,'courier'),($4,'merchant')`,
    [admin.userId, courier.userId, courier2.userId, outsider.userId]);
  await db.query(`INSERT INTO delivery.courier_profiles (user_id,vehicle_type,status,is_online,current_zone_id)
    VALUES ($1,'bicycle','active',true,$3),($2,'bicycle','active',true,$3)`, [courier.userId, courier2.userId, zoneId]);
  customer.addressId = await address(customer, true);
  other.addressId = await address(other, true);
}, { timeout: 30000 });

after(async () => {
  if (db) await db.end();
  if (app) await app.close();
});

test('baseline y migraciones: 46 tablas, 5 vistas y ninguna compra dejada por la verificación SQL', async () => {
  const result = await db.query(`SELECT table_type, count(*)::int AS total FROM information_schema.tables
    WHERE table_schema IN ('identity','geography','merchant','catalog','ordering','inventory','billing','delivery','support','platform') GROUP BY table_type`);
  assert.equal(result.rows.find((r) => r.table_type === 'BASE TABLE').total, 46);
  assert.equal(result.rows.find((r) => r.table_type === 'VIEW').total, 5);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM ordering.purchases')).rows[0].total, 0);
});

test('salud, validación, autenticación y request ID operan por HTTP', async () => {
  assert.equal(status(await api('get', '/health'), 200).database, 'connected');
  const suppliedId = randomUUID();
  const denied = await api('get', '/me', null, undefined, { 'X-Request-Id': suppliedId });
  status(denied, 401);
  assert.equal(denied.body.requestId, suppliedId);
  assert.equal(denied.headers['x-request-id'], suppliedId);
  const profile = status(await api('get', '/me', customer), 200);
  assert.equal(profile.id, customer.userId);
  status(await api('post', '/auth/register', null, { ...profile, role: 'admin' }), 400);
  status(await api('post', '/auth/login', null, { email: customer.email, password: 'incorrecta' }), 401);
});

test('login/logout y suspensión verifican sesiones persistidas', async () => {
  const response = await api('post', '/auth/login', null, { email: customer.email, password });
  status(response, 200);
  const login = signedIn(response);
  status(await api('get', '/me', login), 200);
  status(await api('post', '/auth/logout', login), 204);
  status(await api('get', '/me', login), 401);
  const suspended = await register('suspendido');
  await db.query(`UPDATE identity.users SET status='suspended' WHERE id=$1`, [suspended.userId]);
  status(await api('get', '/me', suspended), 401);
  status(await api('post', '/auth/login', null, { email: suspended.email, password }), 401);
});

test('direcciones: referencia omitida, predeterminada y archivo respetan propietario', async () => {
  assert.equal(status(await api('get', '/geography/zones'), 200)[0].id, zoneId);
  const next = await address(customer, true);
  let rows = status(await api('get', '/me/addresses', customer), 200);
  assert.equal(rows.filter((r) => r.isDefault).length, 1);
  assert.equal(rows.find((r) => r.id === next).reference, '');
  status(await api('delete', `/me/addresses/${next}`, other), 404);
  status(await api('delete', `/me/addresses/${next}`, customer), 204);
  rows = status(await api('get', '/me/addresses', customer), 200);
  assert.equal(rows.some((r) => r.id === next), false);
  assert.ok((await db.query('SELECT archived_at FROM geography.addresses WHERE id=$1', [next])).rows[0].archived_at);
});

test('solicitud comercial permanece pendiente y solo admin la aprueba', async () => {
  const created = status(await api('post', '/merchant/stores', owner, {
    categoryCode: 'restaurantes', zoneId, name: 'Comercio de prueba',
    addressText: 'Dirección de prueba', phone: owner.phone,
  }), 201);
  storeId = created.id;
  assert.equal(created.status, 'pending');
  status(await api('get', `/stores/${storeId}`), 404);
  assert.equal(status(await api('get', '/stores'), 200).length, 0);
  status(await api('post', `/admin/stores/${storeId}/approve`, owner), 403);
  status(await api('post', `/merchant/stores/${storeId}/products`, owner, {
    categoryId, name: 'No publicado', skuCode: 'DENIED', variantName: 'A', priceCents: 100, initialStock: 1,
  }), 403);
  status(await api('post', `/admin/stores/${storeId}/approve`, admin), 201);
  const detail = status(await api('get', `/stores/${storeId}`), 200);
  assert.equal(detail.accepting_orders, true);
  assert.equal(detail.rating_average, null);
  assert.deepEqual(detail.openingIntervals, []);
  status(await api('put', `/merchant/stores/${storeId}/hours`, owner, { intervals: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, opensAt: '00:00', closesAt: '24:00' })) }), 200);
  assert.equal(status(await api('get', '/stores?category=restaurantes'), 200).length, 1);
});

test('catálogo y stock se crean atómicamente; otro comercio no puede publicar', async () => {
  assert.ok(status(await api('get', '/catalog/categories'), 200).some((category) => category.id === categoryId));
  const input = { categoryId, name: 'Prueba', skuCode: `TEST-${randomUUID()}`, variantName: 'A', priceCents: 1200, initialStock: 3 };
  status(await api('post', `/merchant/stores/${storeId}/products`, outsider, input), 403);
  const created = status(await api('post', `/merchant/stores/${storeId}/products`, owner, input), 201);
  const products = status(await api('get', `/stores/${storeId}/products`), 200);
  assert.equal(products.items.find((p) => p.id === created.productId).skus[0].availableStock, 3);
  assert.equal(status(await api('get', `/catalog/search?q=Prueba&category=${categoryId}`), 200).items.length, 1);
  const countBefore = (await db.query('SELECT count(*)::int AS total FROM catalog.products')).rows[0].total;
  status(await api('post', `/merchant/stores/${storeId}/products`, owner, { ...input, name: 'Duplicado' }), 409);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM catalog.products')).rows[0].total, countBefore);
  const { categoryId: omitted, ...invalid } = input;
  status(await api('post', `/merchant/stores/${storeId}/products`, owner, invalid), 400);
});

test('checkout exige clave, rechaza métodos digitales y direcciones ajenas', async () => {
  const item = await product();
  const input = { addressId: customer.addressId, paymentMethod: 'cash', items: [{ skuId: item.skuId, quantity: 1 }] };
  status(await api('post', '/purchases', customer, input), 400);
  status(await api('post', '/purchases', customer, { ...input, paymentMethod: 'card' }, { 'Idempotency-Key': randomUUID() }), 400);
  status(await purchase(customer, item.skuId, 1, randomUUID(), other.addressId), 404);
  status(await api('post', '/purchases', customer, { ...input, totalCents: 1 }, { 'Idempotency-Key': randomUUID() }), 400);
  status(await api('get', '/stores/not-a-uuid'), 400);
});

test('checkout concurrente con misma clave devuelve una compra y detecta contenido diferente', async () => {
  const item = await product(5, 1500);
  const key = randomUUID();
  const results = await Promise.all([purchase(customer, item.skuId, 2, key), purchase(customer, item.skuId, 2, key)]);
  const first = status(results[0], 201);
  assert.deepEqual(status(results[1], 201), first);
  assert.equal(first.totalCents, 3300);
  assert.equal(first.storeName, 'Comercio de prueba');
  assert.match(first.purchaseNumber, /^QK-\d{6,}$/);
  status(await purchase(customer, item.skuId, 1, key), 409);
  const available = (await db.query('SELECT * FROM inventory.availability WHERE sku_id=$1', [item.skuId])).rows[0];
  assert.equal(available.available, 3);
  const keys = (await db.query('SELECT response_status, response_body FROM platform.idempotency_keys WHERE key=$1', [key])).rows;
  assert.equal(keys.length, 1);
  assert.equal(keys[0].response_status, 201);
  const history = status(await api('get', '/me/purchases', customer), 200);
  assert.ok(history.some((p) => p.id === first.purchaseId && p.total_cents === 3300));
  const storeOrders = status(await api('get', `/merchant/stores/${storeId}/orders`, owner), 200);
  assert.ok(storeOrders.some((o) => o.order_id === first.orderId));
  status(await api('get', `/merchant/stores/${storeId}/orders`, outsider), 403);
});

test('dos clientes disputan la última unidad sin sobreventa ni compra parcial', async () => {
  const item = await product(1);
  const beforeCount = (await db.query('SELECT count(*)::int AS total FROM ordering.purchases')).rows[0].total;
  const results = await Promise.all([purchase(customer, item.skuId), purchase(other, item.skuId)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM ordering.purchases')).rows[0].total, beforeCount + 1);
  assert.equal((await db.query('SELECT available FROM inventory.availability WHERE sku_id=$1', [item.skuId])).rows[0].available, 0);
});

test('checkout rechaza SKU inactivo, tienda pausada y dirección archivada', async () => {
  const item = await product();
  await db.query('UPDATE catalog.skus SET is_active=false WHERE id=$1', [item.skuId]);
  status(await purchase(customer, item.skuId), 409);
  await db.query('UPDATE catalog.skus SET is_active=true WHERE id=$1', [item.skuId]);
  await db.query('UPDATE merchant.stores SET accepting_orders=false WHERE id=$1', [storeId]);
  status(await purchase(customer, item.skuId), 409);
  await db.query('UPDATE merchant.stores SET accepting_orders=true WHERE id=$1', [storeId]);
  const archived = await address(customer);
  status(await api('delete', `/me/addresses/${archived}`, customer), 204);
  status(await purchase(customer, item.skuId, 1, randomUUID(), archived), 404);
});

test('cancelar verifica permisos, libera una sola vez y cancela intento de efectivo', async () => {
  const item = await product(2);
  const bought = status(await purchase(customer, item.skuId), 201);
  status(await api('post', `/orders/${bought.orderId}/cancellations`, other, { reason: 'Sin permiso' }), 403);
  status(await api('post', `/merchant/orders/${bought.orderId}/accept`, outsider), 403);
  status(await api('post', `/orders/${bought.orderId}/cancellations`, customer, { reason: 'Cambio de planes' }), 201);
  status(await api('post', `/orders/${bought.orderId}/cancellations`, customer, { reason: 'Reintento' }), 409);
  assert.equal((await db.query('SELECT available FROM inventory.availability WHERE sku_id=$1', [item.skuId])).rows[0].available, 2);
  assert.equal((await db.query('SELECT status FROM billing.payment_attempts WHERE purchase_id=$1', [bought.purchaseId])).rows[0].status, 'cancelled');
  const events = (await db.query('SELECT order_version,status_code FROM ordering.order_events WHERE merchant_order_id=$1 ORDER BY order_version', [bought.orderId])).rows;
  assert.deepEqual(events, [{ order_version: 0, status_code: 'pending' }, { order_version: 1, status_code: 'cancelled' }]);
});

test('comercio no puede saltar transiciones y una acción repetida no duplica historial', async () => {
  const item = await product();
  const bought = status(await purchase(customer, item.skuId), 201);
  status(await api('post', `/merchant/orders/${bought.orderId}/mark-ready`, owner), 409);
  status(await api('post', `/merchant/orders/${bought.orderId}/accept`, owner), 201);
  status(await api('post', `/merchant/orders/${bought.orderId}/accept`, owner), 409);
  status(await api('post', `/orders/${bought.orderId}/cancellations`, owner, { reason: 'No disponible',expectedVersion:1 }), 201);
});

test('reparto: perfil offline y dos repartidores disputando el mismo pedido', async () => {
  const bought = await readyOrder();
  const available = status(await api('get', '/courier/available-orders', courier), 200);
  assert.ok(available.some((o) => o.order_id === bought.orderId));
  assert.equal(available.some((o) => 'recipient_name' in o || 'dest_street' in o), false);
  await db.query('UPDATE delivery.courier_profiles SET is_online=false WHERE user_id=$1', [courier.userId]);
  status(await api('post', `/courier/orders/${bought.orderId}/claim`, courier), 409);
  await db.query('UPDATE delivery.courier_profiles SET is_online=true WHERE user_id=$1', [courier.userId]);
  const results = await Promise.all([
    api('post', `/courier/orders/${bought.orderId}/claim`, courier),
    api('post', `/courier/orders/${bought.orderId}/claim`, courier2),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const winner = results[0].status === 201 ? courier : courier2;
  const loser = winner === courier ? courier2 : courier;
  const assignment = results.find((r) => r.status === 201).body;
  assert.equal(assignment.status, 'accepted');
  assert.ok(assignment.accepted_at);
  assert.equal(assignment.agreed_fee_cents, 240);
  assert.equal(status(await api('get', '/courier/active-assignment', winner), 200).assignment_id, assignment.id);
  status(await api('post', `/courier/assignments/${assignment.id}/pickup`, loser), 404);
  status(await api('post', `/courier/assignments/${assignment.id}/deliver`, winner,{cashReceivedCents:5000}), 409);
  status(await api('post', `/courier/assignments/${assignment.id}/pickup`, winner), 201);
  status(await api('post', `/courier/assignments/${assignment.id}/pickup`, winner), 409);
  status(await api('post', `/courier/assignments/${assignment.id}/deliver`, winner,{cashReceivedCents:5000}), 201);
  status(await api('post', `/courier/assignments/${assignment.id}/deliver`, winner,{cashReceivedCents:5000}), 409);
  const stock = (await db.query('SELECT on_hand,available FROM inventory.availability WHERE sku_id=$1', [bought.skuId])).rows[0];
  assert.deepEqual(stock, { on_hand: 4, available: 4 });
  const payment = (await db.query('SELECT status,collected_by_user_id,succeeded_at FROM billing.payment_attempts WHERE purchase_id=$1', [bought.purchaseId])).rows[0];
  assert.equal(payment.status, 'succeeded');
  assert.equal(payment.collected_by_user_id, winner.userId);
  assert.ok(payment.succeeded_at);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM ordering.order_events WHERE merchant_order_id=$1', [bought.orderId])).rows[0].total, 6);
});

test('un mismo repartidor no toma dos pedidos concurrentes', async () => {
  const first = await readyOrder();
  const second = await readyOrder();
  const results = await Promise.all([
    api('post', `/courier/orders/${first.orderId}/claim`, courier),
    api('post', `/courier/orders/${second.orderId}/claim`, courier),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});

test('notificaciones aíslan destinatarios y auditoría usa columnas reales', async () => {
  const notification = (await db.query(`INSERT INTO platform.notifications (user_id,kind,title,message,relative_url)
    VALUES ($1,'order','Prueba','Mensaje persistido','/cliente/pedidos') RETURNING id`, [customer.userId])).rows[0].id;
  const list = status(await api('get', '/notifications', customer), 200);
  assert.equal(list.find((n) => n.id === notification).message, 'Mensaje persistido');
  status(await api('patch', `/notifications/${notification}/read`, other), 204);
  assert.equal((await db.query('SELECT read_at FROM platform.notifications WHERE id=$1', [notification])).rows[0].read_at, null);
  status(await api('patch', `/notifications/${notification}/read`, customer), 204);
  assert.ok((await db.query('SELECT read_at FROM platform.notifications WHERE id=$1', [notification])).rows[0].read_at);
  const requestId = randomUUID();
  await app.get(PlatformService).recordAudit('f0.test', 'store', storeId, admin.userId, { source: 'harness' }, requestId);
  const audit = (await db.query('SELECT entity_id,actor_user_id,request_id FROM platform.audit_entries WHERE request_id=$1', [requestId])).rows[0];
  assert.deepEqual(audit, { entity_id: storeId, actor_user_id: admin.userId, request_id: requestId });
});

test('F1: cookie HttpOnly, restauración sin credencial JSON y ausencia de caché', async () => {
  const response = await api('post', '/auth/login', null, { email: customer.email, password });
  status(response, 200);
  const cookie = response.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\//i);
  assert.equal('sessionToken' in response.body, false);
  assert.equal('rawToken' in response.body, false);
  const session = signedIn(response);
  const restored = await api('get', '/auth/session', session);
  assert.equal(status(restored, 200).user.id, customer.userId);
  assert.equal(restored.body.csrfToken, session.csrfToken);
  assert.equal(restored.headers['cache-control'], 'no-store');
  assert.notEqual(session.sessionCookie.split('=')[1], session.csrfToken);
});

test('F1: mutaciones exigen origen permitido y CSRF de la sesión', async () => {
  const route = '/api/v1/me';
  const mutation = () => request(server).patch(route).set('Cookie', customer.sessionCookie).send({ fullName: 'Cambio rechazado' });
  status(await mutation(), 403);
  status(await mutation().set('Origin', 'https://sitio-ajeno.example').set('X-CSRF-Token', customer.csrfToken), 403);
  const missing = await mutation().set('Origin', 'http://localhost:5173');
  assert.equal(status(missing, 403).code, 'CSRF_INVALID');
  status(await mutation().set('Origin', 'http://localhost:5173').set('X-CSRF-Token', other.csrfToken), 403);
  status(await request(server).post('/api/v1/auth/login').send({ email: customer.email, password }), 403);
  status(await request(server).get('/api/v1/me').set('Authorization', 'Bearer token_invalido'), 401);
  status(await request(server).get('/api/v1/me').set('Authorization', `Bearer ${customer.sessionCookie.split('=')[1]}`), 200);
});

test('F1: perfil se guarda, persiste entre sesiones y no permite elevar privilegios', async () => {
  const user = await register('perfil');
  const updated = status(await api('patch', '/me', user, { fullName: 'Nombre persistido' }), 200);
  assert.equal(updated.fullName, 'Nombre persistido');
  status(await api('patch', '/me', user, { roles: ['admin'], status: 'active' }), 400);
  status(await api('patch', '/me', user, { id: other.userId, fullName: 'Ataque' }), 400);
  status(await api('patch', '/me', user, { fullName: '   ' }), 400);
  const login = await api('post', '/auth/login', null, { email: user.email, password });
  status(login, 200);
  assert.equal(status(await api('get', '/me', signedIn(login)), 200).fullName, 'Nombre persistido');
  assert.deepEqual(updated.roles, ['customer']);
});

test('F1: rotación invalida la cookie anterior y logout revoca la nueva', async () => {
  const user = await register('rotacion');
  const response = await api('post', '/auth/login', user, { email: user.email, password });
  status(response, 200);
  const next = signedIn(response);
  assert.notEqual(next.sessionCookie, user.sessionCookie);
  status(await api('get', '/auth/session', user), 401);
  status(await api('get', '/auth/session', next), 200);
  status(await api('patch', '/me', { ...next, csrfToken: user.csrfToken }, { fullName: 'Cambio inválido' }), 403);
  const closed = await api('post', '/auth/logout', next);
  status(closed, 204);
  assert.match(closed.headers['set-cookie'][0], /quickly_session=;/);
  assert.match(closed.headers['set-cookie'][0], /HttpOnly/i);
  status(await api('get', '/me', next), 401);
});

test('F1: una sesión vencida deja de autorizar perfil y restauración', async () => {
  const user = await register('vencida');
  await db.query(`UPDATE identity.sessions SET expires_at=created_at + interval '1 millisecond' WHERE user_id=$1`, [user.userId]);
  status(await api('get', '/auth/session', user), 401);
  status(await api('patch', '/me', user, { fullName: 'Sesión vencida' }), 401);
});

test('F1: roles y membresías se consultan al servidor, sin contextos inventados', async () => {
  const session = status(await api('get', '/auth/session', owner), 200);
  assert.ok(session.user.roles.includes('merchant'));
  assert.ok(session.user.memberships.some((m) => m.storeId === storeId && m.membershipRole === 'owner'));
  const unprivileged = status(await api('get', '/auth/session', customer), 200);
  assert.deepEqual(unprivileged.user.roles, ['customer']);
  assert.deepEqual(unprivileged.user.memberships, []);
});

test('F1: CORS autoriza solo origen permitido y cookie usa Secure con HTTPS configurado', async () => {
  const allowed = await request(server).options('/api/v1/me').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'PATCH').set('Access-Control-Request-Headers', 'X-CSRF-Token');
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.equal(allowed.headers['access-control-allow-credentials'], 'true');
  const denied = await request(server).options('/api/v1/me').set('Origin', 'https://sitio-ajeno.example').set('Access-Control-Request-Method', 'PATCH');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
  const previous = process.env.SESSION_COOKIE_SECURE;
  process.env.SESSION_COOKIE_SECURE = 'true';
  try {
    const response = await api('post', '/auth/login', null, { email: customer.email, password });
    status(response, 200);
    assert.match(response.headers['set-cookie'][0], /; Secure;/);
  } finally {
    if (previous === undefined) delete process.env.SESSION_COOKIE_SECURE; else process.env.SESSION_COOKIE_SECURE = previous;
  }
});

test('F1: limita intentos de autenticación y devuelve un error uniforme con Retry-After', async () => {
  let limited;
  for (let i = 0; i <= Number(process.env.AUTH_RATE_LIMIT || 30); i++) {
    const response = await api('post', '/auth/login', null, { email: 'invalid', password: 'x' });
    if (response.status === 429) { limited = response; break; }
    assert.equal(status(response, 400).code, 'VALIDATION_ERROR');
  }
  assert.ok(limited);
  assert.equal(limited.body.code, 'AUTH_RATE_LIMIT');
  assert.ok(Number(limited.headers['retry-after']) > 0);
});
