import { setTimeout as delay } from 'node:timers/promises';

// Keep deployment credentials at api.vercel.com; do not accept a configurable API origin.
export async function deployFromGit(config, { fetchImpl = fetch, wait = delay, pollLimit = 180 } = {}) {
  for (const field of ['token', 'orgId', 'projectId', 'repoId', 'sha']) {
    if (typeof config[field] !== 'string' || !config[field].trim()) {
      throw new Error(`Missing deployment configuration: ${field}. See docs/DEPLOYMENT.md.`);
    }
  }
  if (!/^\d+$/.test(config.repoId) || !/^[a-f0-9]{40,64}$/i.test(config.sha)) {
    throw new Error('Expected a numeric GitHub repository ID and a full checked commit SHA.');
  }

  async function request(path, body) {
    const url = new URL(path, 'https://api.vercel.com');
    if (config.orgId.startsWith('team_')) url.searchParams.set('teamId', config.orgId);
    const response = await fetchImpl(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`Vercel API returned ${response.status}. Check token access, project settings and the linked GitHub repository.`);
    }
    return response.json();
  }

  let deployment = await request('/v13/deployments', {
    name: 'showlio',
    project: config.projectId,
    target: 'production',
    gitSource: { type: 'github', repoId: config.repoId, ref: 'main', sha: config.sha },
  });

  for (let attempt = 0; attempt <= pollLimit; attempt++) {
    if (deployment.aliasError) {
      throw new Error('Vercel could not assign the production aliases. Inspect project domain settings and deployment logs.');
    }
    if (['ERROR', 'CANCELED'].includes(deployment.readyState)) {
      throw new Error(`Vercel deployment ${deployment.readyState}. Inspect the project's build logs.`);
    }
    const aliasesAssigned = deployment.aliasAssigned === true
      || (typeof deployment.aliasAssigned === 'number' && deployment.aliasAssigned > 0);
    if (deployment.readyState === 'READY' && aliasesAssigned) {
      if (typeof deployment.url !== 'string' || !/^[a-z0-9.-]+\.vercel\.app$/i.test(deployment.url)) {
        throw new Error('Vercel did not return a valid deployment hostname.');
      }
      return `https://${deployment.url}`;
    }
    if (!deployment.id) throw new Error('Vercel did not return a deployment ID.');
    if (attempt === pollLimit) break;
    await wait(5000);
    deployment = await request(`/v13/deployments/${encodeURIComponent(deployment.id)}`);
  }

  throw new Error('Timed out waiting for Vercel. The remote build may still be running; inspect it before retrying.');
}
