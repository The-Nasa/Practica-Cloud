const { Client } = require('pg');
const { randomUUID } = require('node:crypto');

async function bootstrapAdmin(db, email) {
  await db.query('BEGIN');
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('quickly.identity.administration'))");
    const users = await db.query("SELECT id FROM identity.users WHERE email=$1 AND status='active' FOR UPDATE", [email.trim().toLowerCase()]);
    if (!users.rowCount) throw new Error('ACTIVE_REGISTERED_ACCOUNT_REQUIRED');
    const userId = users.rows[0].id;
    const admins = await db.query("SELECT user_id FROM identity.user_roles WHERE role_code='admin'");
    if (admins.rowCount) {
      if (!admins.rows.some((row) => row.user_id === userId)) throw new Error('ADMIN_ALREADY_CONFIGURED');
    } else {
      await db.query("INSERT INTO identity.user_roles(user_id,role_code) VALUES($1,'admin')", [userId]);
      await db.query(`INSERT INTO platform.audit_entries(actor_user_id,action,entity_type,entity_id,request_id,details)
        VALUES($1,'identity.admin_bootstrapped','user',$1,$2,'{}')`, [userId, randomUUID()]);
    }
    await db.query('COMMIT');
    return userId;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
module.exports = { bootstrapAdmin };

if (require.main === module) {
  require('dotenv').config();
  (async () => {
    const index = process.argv.indexOf('--email');
    const email = index >= 0 ? process.argv[index + 1] : undefined;
    if (!email || !email.includes('@') || (!process.env.DATABASE_URL && !process.env.DATABASE_HOST)) throw new Error('USE_ADMIN_BOOTSTRAP_EMAIL');
    const useSsl = process.env.DATABASE_SSL === 'true' || process.env.DATABASE_URL?.includes('supabase') || process.env.DATABASE_HOST?.includes('supabase');
    const ssl = useSsl ? { rejectUnauthorized: false } : undefined;
    const db = new Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, ssl } : {
      host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT || 5432),
      user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME,
      ssl,
    });
    try { await db.connect(); await bootstrapAdmin(db, email); console.log('Administrador inicial habilitado. Restaure o vuelva a iniciar su sesión.'); }
    finally { await db.end(); }
  })().catch((error) => { const code = String(error.code || error.message); console.error(`Bootstrap rechazado (${/^[A-Z0-9_]+$/.test(code) ? code : 'BOOTSTRAP_FAILED'}).`); process.exitCode = 1; });
}
