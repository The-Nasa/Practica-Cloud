const { Client } = require('pg');
require('dotenv').config();

const { scrypt, timingSafeEqual } = require('crypto');
const { promisify } = require('util');
const scryptAsync = promisify(scrypt);

async function verifyPassword(password, storedHash) {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return timingSafeEqual(keyBuffer, derivedKey);
}

async function verify() {
  const useSsl = process.env.DATABASE_SSL === 'true' || process.env.DATABASE_URL?.includes('supabase') || process.env.DATABASE_HOST?.includes('supabase');
  const ssl = useSsl ? { rejectUnauthorized: false } : undefined;
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl });
  await db.connect();

  const tables = [
    'geography.coverage_zones',
    'identity.users',
    'identity.user_roles',
    'merchant.stores',
    'merchant.memberships',
    'merchant.opening_intervals',
    'catalog.products',
    'catalog.skus',
    'inventory.stock',
    'inventory.movements',
    'delivery.courier_profiles',
    'geography.addresses',
  ];

  console.log('--- RECUENTO DE TABLAS EN POSTGRESQL ---');
  for (const t of tables) {
    const res = await db.query(`SELECT count(*) FROM ${t}`);
    console.log(`${(t + ':').padEnd(30)} ${res.rows[0].count}`);
  }

  console.log('\n--- VERIFICACIÓN DE CUENTAS CLAVE ---');
  const keyUsers = await db.query(`
    SELECT u.email, u.full_name, u.status, array_agg(ur.role_code ORDER BY ur.role_code) as roles
    FROM identity.users u
    JOIN identity.user_roles ur ON ur.user_id = u.id
    WHERE u.email IN ('cliente@quickly.pe', 'comercio@quickly.pe', 'repartidor@quickly.pe', 'admin@quickly.pe')
    GROUP BY u.id, u.email, u.full_name, u.status
    ORDER BY u.email
  `);
  console.table(keyUsers.rows);

  console.log('\n--- VERIFICACIÓN DE CREDENCIALES (Password123!) ---');
  for (const row of keyUsers.rows) {
    const cred = await db.query('SELECT password_hash FROM identity.password_credentials pc JOIN identity.users u ON u.id = pc.user_id WHERE u.email = $1', [row.email]);
    const ok = cred.rows[0] ? await verifyPassword('Password123!', cred.rows[0].password_hash) : false;
    console.log(`  ${row.email.padEnd(26)} -> Password123!: ${ok ? '✅ VÁLIDA' : '❌ INVÁLIDA'}`);
  }

  console.log('\n--- VERIFICACIÓN DE ZONAS DE TINGO MARÍA ---');
  const zones = await db.query('SELECT code, name, base_fee_cents, is_active FROM geography.coverage_zones ORDER BY code');
  console.table(zones.rows);

  console.log('\n--- MUESTRA DE TIENDAS ---');
  const stores = await db.query('SELECT name, category_code, status, accepting_orders, phone FROM merchant.stores LIMIT 5');
  console.table(stores.rows);

  console.log('\n--- MUESTRA DE PRODUCTOS Y SKUS ---');
  const prods = await db.query(`
    SELECT p.name as product, s.sku_code, s.variant_name, s.price_cents, st.on_hand
    FROM catalog.products p
    JOIN catalog.skus s ON s.product_id = p.id
    JOIN inventory.stock st ON st.sku_id = s.id
    LIMIT 5
  `);
  console.table(prods.rows);

  await db.end();
}

verify().catch(console.error);
