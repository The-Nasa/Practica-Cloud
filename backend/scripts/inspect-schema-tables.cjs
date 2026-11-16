const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const tables = [
    'catalog.products',
    'catalog.skus',
    'catalog.product_images',
    'merchant.stores',
    'merchant.memberships',
    'ordering.purchases',
    'ordering.merchant_orders',
    'ordering.order_items',
    'delivery.assignments',
    'platform.notifications'
  ];

  for (const t of tables) {
    const [schema, table] = t.split('.');
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [schema, table]);
    console.log(`=== Table: ${t} ===`);
    console.log(cols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
  }
  await client.end();
}

main().catch(console.error);
