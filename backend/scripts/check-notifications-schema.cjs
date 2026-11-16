const { Client } = require('pg');
require('dotenv').config({ path: 'd:/app-Quickly/Quickly-backend/.env' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'notifications'
    ORDER BY ordinal_position
  `);
  console.log('platform.notifications columns:');
  console.table(res.rows);

  const notifs = await client.query(`
    SELECT * FROM platform.notifications LIMIT 5
  `);
  console.log('Sample notifications count:', notifs.rows.length);

  await client.end();
}
check().catch(console.error);
