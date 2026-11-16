const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT u.email, u.full_name, m.store_id, s.name as store_name, s.status as store_status, m.membership_role
    FROM identity.users u
    JOIN merchant.memberships m ON m.user_id = u.id AND m.is_active
    JOIN merchant.stores s ON s.id = m.store_id
    WHERE u.email IN ('comercio@quickly.pe', 'elbalcon@quickly.pe')
  `);
  console.log('Stores for merchants:');
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
