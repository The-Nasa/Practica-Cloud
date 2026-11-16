const { Client } = require('pg');
require('dotenv').config({ path: 'd:/app-Quickly/Quickly-backend/.env' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
  await client.connect();
  const res1 = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'delivery' AND table_name = 'assignments'
    ORDER BY ordinal_position
  `);
  console.log('delivery.assignments:');
  console.table(res1.rows);

  const res2 = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'delivery' AND table_name = 'courier_profiles'
    ORDER BY ordinal_position
  `);
  console.log('delivery.courier_profiles:');
  console.table(res2.rows);

  const couriers = await client.query(`
    SELECT c.*, u.email, u.full_name
    FROM delivery.courier_profiles c
    JOIN identity.users u ON c.user_id = u.id
  `);
  console.log('Couriers:');
  console.table(couriers.rows);

  await client.end();
}
check().catch(console.error);
