import { appendFileSync } from 'node:fs';
import { deployFromGit } from './lib/vercel.mjs';

const url = await deployFromGit({
  token: process.env.VERCEL_TOKEN,
  orgId: process.env.VERCEL_ORG_ID,
  projectId: process.env.VERCEL_PROJECT_ID,
  repoId: process.env.GITHUB_REPOSITORY_ID,
  sha: process.env.GITHUB_SHA,
});

console.log(`Production deployment ready: ${url}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Production deployment: ${url}\n`);
