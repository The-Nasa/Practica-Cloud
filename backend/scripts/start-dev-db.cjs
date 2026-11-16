const { spawnSync } = require('node:child_process');
const path = require('node:path');
const start = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'postgres'], { stdio: 'inherit', windowsHide: true });
if (start.error || start.status) process.exitCode = start.status || 1;
else {
  const migrate = spawnSync(process.execPath, [path.join(__dirname, 'migrate.cjs')], { stdio: 'inherit', windowsHide: true });
  process.exitCode = migrate.error ? 1 : (migrate.status ?? 1);
}
