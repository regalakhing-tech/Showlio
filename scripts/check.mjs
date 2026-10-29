import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const path of ['package.json', 'package-lock.json', 'vercel.json']) {
  JSON.parse(readFileSync(path, 'utf8'));
}

for (const path of ['api', 'src', 'scripts', 'tests', 'public/assets/js'].flatMap(filesIn)) {
  if (path.endsWith('.php')) run('php', ['-l', path]);
  if (/\.(mjs|js)$/.test(path)) run(process.execPath, ['--check', path]);
}

run(process.execPath, ['scripts/build.mjs']);
run(process.execPath, ['--test', ...filesIn('tests').filter((path) => path.endsWith('.test.mjs'))]);
