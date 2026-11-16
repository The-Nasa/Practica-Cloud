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
    SELECT u.id, u.email, u.full_name, u.status, array_agg(ur.role_code) as roles
    FROM identity.users u
    LEFT JOIN identity.user_roles ur ON ur.user_id = u.id
    GROUP BY u.id, u.email, u.full_name, u.status
    ORDER BY u.email
  `);
  console.log('Total users:', res.rowCount);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
