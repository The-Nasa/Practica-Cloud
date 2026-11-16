// Run once after migrations with the schema owner, never with the API role.
const { Client } = require('pg');
async function provision(db, password) {
  if (typeof password !== 'string' || password.length < 32 || password.startsWith('REPLACE_')) throw new Error('STRONG_RUNTIME_PASSWORD_REQUIRED');
  await db.query('BEGIN');
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('quickly.runtime-role'))");
    if (!(await db.query("SELECT 1 FROM pg_roles WHERE rolname='quickly_app'")).rowCount) await db.query('CREATE ROLE quickly_app LOGIN');
    await db.query('ALTER ROLE quickly_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
    const statement = (await db.query("SELECT format('ALTER ROLE quickly_app PASSWORD %L',$1::text) AS sql", [password])).rows[0].sql;
    await db.query(statement);
    for (const schema of ['identity','geography','merchant','catalog','ordering','inventory','billing','delivery','support','platform']) {
      await db.query(`GRANT USAGE ON SCHEMA ${schema} TO quickly_app`);
      await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO quickly_app`);
      await db.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO quickly_app`);
      await db.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} TO quickly_app`);
    }
    await db.query('REVOKE ALL ON platform.schema_migrations FROM quickly_app');
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
module.exports = { provision };
if (require.main === module) {
  const db = new Client({host:process.env.DATABASE_HOST,port:Number(process.env.DATABASE_PORT||5432),user:process.env.DATABASE_USER,
    password:process.env.DATABASE_PASSWORD,database:process.env.DATABASE_NAME,connectionTimeoutMillis:5000});
  (async()=>{try{await db.connect();await provision(db,process.env.RUNTIME_DATABASE_PASSWORD);console.log('Rol de ejecución preparado sin permisos de administrador ni DDL.');}finally{await db.end();}})()
    .catch(error=>{const code=String(error.code||'PROVISION_FAILED');console.error(`No se pudo preparar el rol de ejecución (${/^[A-Z0-9_]+$/.test(code)?code:'PROVISION_FAILED'}). No se imprimen claves ni SQL.`);process.exitCode=1;});
}
