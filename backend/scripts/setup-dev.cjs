const { randomBytes } = require('node:crypto');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const target = path.join(root, '.env');
if (existsSync(target)) {
  console.log('.env ya existe; se conserva sin cambios. Revise .env.example si necesita nuevas variables.');
} else {
  const password = randomBytes(24).toString('hex');
  const testPassword = randomBytes(24).toString('hex');
  const template = readFileSync(path.join(root, '.env.example'), 'utf8');
  const content = template.split(/\r?\n/).map((line) => {
    if (line.startsWith('DATABASE_PASSWORD=')) return `DATABASE_PASSWORD=${password}`;
    if (line.startsWith('DATABASE_URL=')) return `DATABASE_URL=postgresql://quickly_user:${password}@127.0.0.1:5433/quickly_db`;
    if (line.startsWith('TEST_DATABASE_PASSWORD=')) return `TEST_DATABASE_PASSWORD=${testPassword}`;
    if (line.startsWith('TEST_DATABASE_URL=')) return `TEST_DATABASE_URL=postgresql://quickly_test:${testPassword}@127.0.0.1:15432/postgres`;
    return line;
  }).join('\n');
  writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
  console.log('.env creado con credenciales locales aleatorias; no se imprimen ni se guardan en Git.');
}
