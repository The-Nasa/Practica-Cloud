const { spawnSync } = require('node:child_process');
const fs = require('node:fs'); const path = require('node:path');
const suites = ['f0','f2','f3','f4','f5','f6','f7'];
const workspace = path.resolve(__dirname, '../..'); const evidence = path.join(workspace, '.tmp', 'block8'); fs.mkdirSync(evidence, { recursive: true });
const log = path.join(evidence, 'sql-http.log'); fs.writeFileSync(log, 'SQL/HTTP local: bases aleatorias independientes, no Supabase.\n');
for (const suite of suites) {
 const run = spawnSync(process.execPath, [path.join(__dirname, '../test/run-e2e.cjs'), '--suite=' + suite], { cwd: path.join(__dirname, '..'), windowsHide: true, encoding: 'utf8' });
 fs.appendFileSync(log, '\n' + suite + '\n' + (run.stdout || '') + (run.stderr || ''));
 console.log(suite + ': ' + (run.status === 0 ? 'APROBADA' : 'FALLÓ') + ' (detalle en .tmp/block8/sql-http.log)');
 if (run.error || run.status !== 0) { process.exitCode = 1; break; }
}
