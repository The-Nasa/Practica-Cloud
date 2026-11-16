const { Client } = require('pg');
require('dotenv').config({ path: 'd:/app-Quickly/Quickly-backend/.env' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
  await client.connect();
  const triggers = await client.query(`
    SELECT event_object_schema, event_object_table, trigger_name, action_statement, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE event_object_schema IN ('delivery', 'ordering')
  `);
  console.log('Triggers:');
  console.table(triggers.rows);

  await client.end();
}
check().catch(console.error);
