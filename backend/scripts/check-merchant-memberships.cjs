const { Client } = require('pg');
require('dotenv').config({ path: 'd:/app-Quickly/Quickly-backend/.env' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
  await client.connect();
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'merchant' AND table_name = 'memberships'
    ORDER BY ordinal_position
  `);
  console.log('merchant.memberships columns:');
  console.table(cols.rows);

  const rows = await client.query(`
    SELECT m.*, s.name as store_name, u.email
    FROM merchant.memberships m
    JOIN merchant.stores s ON m.store_id = s.id
    JOIN identity.users u ON m.user_id = u.id
  `);
  console.log('Memberships:');
  console.table(rows.rows);

  await client.end();
}
check().catch(console.error);
