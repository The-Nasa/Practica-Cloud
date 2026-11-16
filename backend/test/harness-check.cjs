const { spawnSync } = require('node:child_process');

const checks = [
  ['Compilar backend', require.resolve('@nestjs/cli/bin/nest.js'), 'build'],
  ['Contrato OpenAPI', require.resolve('../scripts/export-openapi.cjs'), '--check'],
  ['Pruebas unitarias', require.resolve('jest/bin/jest'), '--runInBand'],
  ['PostgreSQL e integración HTTP', require.resolve('./run-e2e.cjs')],
];
for (const [label, ...args] of checks) {
  console.log(`\n${label}`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
