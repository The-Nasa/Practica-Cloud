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
    SELECT s.id, u.email, u.full_name, s.created_at, s.expires_at, s.revoked_at
    FROM identity.sessions s
    JOIN identity.users u ON u.id = s.user_id
    ORDER BY s.created_at DESC
    LIMIT 10
  `);
  console.log('--- Ultimas 10 sesiones en Supabase ---');
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
