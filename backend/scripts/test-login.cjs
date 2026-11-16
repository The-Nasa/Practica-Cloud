const { Client } = require('pg');
const { scrypt } = require('node:crypto');
const { promisify } = require('node:util');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const scryptAsync = promisify(scrypt);

async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const derivedKey = await scryptAsync(password, salt, 64);
  return derivedKey.toString('hex') === hash;
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const testEmails = [
    'cliente@quickly.pe',
    'comercio@quickly.pe',
    'elbalcon@quickly.pe',
    'repartidor@quickly.pe',
    'admin@quickly.pe'
  ];

  for (const email of testEmails) {
    const res = await client.query(`
      SELECT u.id, u.email, u.full_name, pc.password_hash
      FROM identity.users u
      LEFT JOIN identity.password_credentials pc ON pc.user_id = u.id
      WHERE u.email = $1
    `, [email]);

    if (res.rows.length === 0) {
      console.log(`❌ ${email}: User not found in DB`);
      continue;
    }

    const user = res.rows[0];
    const pass123 = user.password_hash ? await verifyPassword('Password123!', user.password_hash) : false;
    const pass6 = user.password_hash ? await verifyPassword('123456', user.password_hash) : false;

    console.log(`User: ${email}`);
    console.log(`  Password123! valid: ${pass123}`);
    console.log(`  123456 valid: ${pass6}`);
  }

  await client.end();
}

main().catch(console.error);
