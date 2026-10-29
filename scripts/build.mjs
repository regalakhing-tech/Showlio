import { spawnSync } from 'node:child_process';

for (const [input, output] of [['src/styles/app.css','public/assets/css/app.css'],['src/styles/workspace.css','public/assets/css/workspace.css'],['src/styles/auth.css','public/assets/css/auth.css']]) {
  const result = spawnSync(process.execPath, ['node_modules/@tailwindcss/cli/dist/index.mjs','-i',input,'-o',output,'--minify'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
