const { spawnSync } = require('node:child_process');
const path = require('node:path');

function run(command, args, cwd = path.join(__dirname, '..')) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true, cwd });
  return result.error ? 1 : (result.status ?? 1);
}

// Start only the test service; development volume is never mounted by this service.
const started = run('docker', ['compose', '--profile', 'test', 'up', '-d', '--wait', 'postgres-test']);
let result = started;
try {
  const browserOnly = process.argv.includes('--browser');
  const full = process.argv.includes('--full');
    const targeted = process.argv.find(value=>value.startsWith('--suite='));
    const spec=process.argv.find(value=>value.startsWith('--spec='));
  if (started === 0) {
    if (browserOnly) {
      result = run(process.execPath, [require.resolve('@nestjs/cli/bin/nest.js'), 'build']);
      if (!result) result = run(process.execPath, [path.join(__dirname, 'export-openapi.cjs'), '--check']);
    } else if(targeted){
      result=run(process.execPath,[require.resolve('@nestjs/cli/bin/nest.js'),'build']);
      if(!result)result=run(process.execPath,[path.join(__dirname,'../test/run-e2e.cjs'),targeted]);
    } else result = run(process.execPath, [path.join(__dirname, '../test/harness-check.cjs')]);
    if (!result && full) {
      const frontend = path.join(__dirname, '../../Frontend-Quickly');
      for (const args of [
        [path.join(frontend, 'scripts/contracts.mjs'), '--check'],
        [path.join(frontend, 'node_modules/typescript/bin/tsc'), '-b'],
        [path.join(frontend, 'node_modules/vite/bin/vite.js'), 'build'],
        [path.join(frontend, 'node_modules/vitest/vitest.mjs'), 'run'],
      ]) { result = run(process.execPath, args, frontend); if (result) break; }
    }
    if (!result && (browserOnly || full)) result = run(process.execPath, [path.join(__dirname, '../test/run-e2e.cjs'), '--browser',...(spec?[spec]:[])]);
  }
} finally {
  // Stop only the disposable test service. Never run down -v or touch development DB.
  const stopped = process.argv.includes('--keep-db') ? 0 : run('docker', ['compose', '--profile', 'test', 'stop', 'postgres-test']);
  if (result === 0) result = stopped;
}
process.exitCode = result;
