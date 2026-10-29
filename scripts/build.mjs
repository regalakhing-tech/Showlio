import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';

for (const [input, output] of [['src/styles/app.css','public/assets/css/app.css'],['src/styles/workspace.css','public/assets/css/workspace.css'],['src/styles/auth.css','public/assets/css/auth.css'],['src/styles/portfolio.css','public/assets/css/portfolio.css'],['src/styles/portfolio-public.css','public/assets/css/portfolio-public.css']]) {
  const result = spawnSync(process.execPath, ['node_modules/@tailwindcss/cli/dist/index.mjs','-i',input,'-o',output,'--minify'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
mkdirSync('public/assets/vendor', { recursive: true });
copyFileSync('node_modules/qrcode-generator/dist/qrcode.mjs', 'public/assets/vendor/qrcode.js');
