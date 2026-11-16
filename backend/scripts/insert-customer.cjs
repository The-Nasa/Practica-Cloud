const { Client } = require('pg');
const { createHash, randomBytes, scrypt } = require('node:crypto');
const { promisify } = require('node:util');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

function toUuid(key) {
  const hash = createHash('sha256').update(key).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Conectado a Supabase PostgreSQL');

  const email = 'cliente.tingo@quickly.pe';
  const fullName = 'Nilver Valdivia (Cliente Tingo María)';
  const phone = '+51962998877';
  const password = 'Cliente123!';
  const userId = toUuid(`user:${email}`);

  // 1. Insertar / Actualizar usuario en identity.users
  const userRes = await client.query(
    `INSERT INTO identity.users (id, full_name, email, phone, status)
     VALUES ($1, $2, $3, $4, 'active')
     ON CONFLICT (email) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       phone = EXCLUDED.phone,
       status = 'active'
     RETURNING id, email, full_name, status`,
    [userId, fullName, email, phone]
  );
  const realId = userRes.rows[0].id;
  console.log('✓ Usuario insertado/actualizado en identity.users:', userRes.rows[0]);

  // 2. Insertar credenciales de contraseña
  const passwordHash = await hashPassword(password);
  await client.query(
    `INSERT INTO identity.password_credentials (user_id, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [realId, passwordHash]
  );
  console.log('✓ Contraseña guardada en identity.password_credentials');

  // 3. Asignar rol customer
  await client.query(
    `INSERT INTO identity.user_roles (user_id, role_code)
     VALUES ($1, 'customer')
     ON CONFLICT (user_id, role_code) DO NOTHING`,
    [realId]
  );
  console.log('✓ Rol customer asignado en identity.user_roles');

  // 4. Obtener zona centro para agregar dirección de entrega
  const zoneRes = await client.query(`SELECT id FROM geography.coverage_zones WHERE code = 'z_centro' LIMIT 1`);
  const zoneId = zoneRes.rows.length ? zoneRes.rows[0].id : null;

  if (zoneId) {
    const addressId1 = toUuid(`address:${email}:casa`);
    await client.query(
      `INSERT INTO geography.addresses (id, user_id, zone_id, label, recipient_name, phone, street, street_number, reference, is_default)
       VALUES ($1, $2, $3, 'Casa', $4, $5, 'Jr. Raymondi', '450', 'Frente a la Alameda Perú', true)
       ON CONFLICT (id) DO UPDATE SET
         is_default = true`,
      [addressId1, realId, zoneId, fullName, phone]
    );

    const addressId2 = toUuid(`address:${email}:trabajo`);
    await client.query(
      `INSERT INTO geography.addresses (id, user_id, zone_id, label, recipient_name, phone, street, street_number, reference, is_default)
       VALUES ($1, $2, $3, 'Trabajo / Oficina', $4, $5, 'Av. Universitaria', '120', 'Cerca al campus UNAS', false)
       ON CONFLICT (id) DO NOTHING`,
      [addressId2, realId, zoneId, fullName, phone]
    );
    console.log('✓ 2 Direcciones de entrega listas en Tingo María (Casa y Trabajo)');
  }

  // 5. Verificar lectura de perfil desde la BD
  const verifyRes = await client.query(
    `SELECT u.id, u.email, u.full_name, u.status, array_agg(ur.role_code) as roles
     FROM identity.users u
     LEFT JOIN identity.user_roles ur ON ur.user_id = u.id
     WHERE u.email = $1
     GROUP BY u.id, u.email, u.full_name, u.status`,
    [email]
  );
  console.log('Verificación final en BD:', verifyRes.rows[0]);

  await client.end();
}

main().catch(console.error);
