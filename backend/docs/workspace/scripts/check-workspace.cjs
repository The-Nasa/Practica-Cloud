const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const backend = path.join(__dirname, '../backend');
const log = path.join(__dirname, '../.tmp/workspace-check.log');
fs.mkdirSync(path.dirname(log), { recursive: true });
const started = Date.now();
const output = fs.openSync(log, 'w');
let result;
try {
  result = spawnSync(process.execPath, [path.join(backend, 'scripts/harness-docker.cjs'), '--full',
    ...(process.argv.includes('--keep-db') ? ['--keep-db'] : [])], {
    cwd: backend, stdio: ['ignore', output, output], windowsHide: true,
  });
} finally { fs.closeSync(output); }
process.exitCode = result.error ? 1 : (result.status ?? 1);
fs.appendFileSync(log, `\nResultado: ${process.exitCode}; duración: ${((Date.now()-started)/1000).toFixed(1)} s\n`);
console.log(`Cierre: código ${process.exitCode}. Registro completo: ${log}`);
if (process.exitCode) console.log(fs.readFileSync(log,'utf8').split(/\r?\n/).slice(-45).join('\n'));
