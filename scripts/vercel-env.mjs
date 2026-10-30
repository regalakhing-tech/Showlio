// Copies the server settings from your local .env to Vercel Production, then redeploy.
// Usage: npm run vercel:env   (needs the Vercel CLI to be logged in: npx vercel login)
// Values are piped to the CLI, never printed. Empty values are skipped and reported.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const NAMES = [
  'APP_ENV', 'APP_URL', 'SITE_URL',
  'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'MAIL_FROM', 'MAIL_FROM_NAME',
];
// Local addresses must not reach production.
const PRODUCTION = { APP_ENV: 'production', APP_URL: 'https://showlio-seven.vercel.app' };

const values = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
  .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2')]));

let failed = false;
for (const name of NAMES) {
  const value = PRODUCTION[name] ?? values[name] ?? '';
  if (!value) { console.log(`skipped ${name}: empty in .env`); continue; }
  const result = spawnSync('npx', ['--no-install', 'vercel', 'env', 'add', name, 'production', '--force'], { input: value, encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status === 0) console.log(`set ${name}`);
  else { failed = true; console.log(`FAILED ${name}: ${(result.stderr || result.stdout).trim().split('\n').pop()}`); }
}
console.log(failed ? 'Some settings failed; fix the errors above and run again.' : 'Done. Redeploy so production picks them up: npm run deploy:production (or push to main).');
process.exit(failed ? 1 : 0);
