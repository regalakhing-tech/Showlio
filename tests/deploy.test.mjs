import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deployFromGit } from '../scripts/lib/vercel.mjs';

const config = {
  token: 'test-token', orgId: 'team_example', projectId: 'prj_example',
  repoId: '123456', sha: 'a'.repeat(40),
};

function apiSequence(payloads, calls = []) {
  return async (url, options) => {
    calls.push({ url: new URL(url), options });
    assert.ok(payloads.length, 'Unexpected API request');
    const next = payloads.shift();
    return Response.json(next.body, { status: next.status ?? 200 });
  };
}

test('deploys the checked GitHub commit and waits for readiness', async () => {
  const calls = [];
  const url = await deployFromGit(config, {
    fetchImpl: apiSequence([
      { body: { id: 'dpl_example', readyState: 'BUILDING' } },
      { body: { id: 'dpl_example', readyState: 'READY', aliasAssigned: true, url: 'showlio-example.vercel.app' } },
    ], calls),
    wait: async () => {},
  });
  assert.equal(url, 'https://showlio-example.vercel.app');
  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.target, 'production');
  assert.equal(body.project, config.projectId);
  assert.equal(body.gitSource.type, 'github');
  assert.equal(body.gitSource.repoId, config.repoId);
  assert.equal(body.gitSource.sha, config.sha);
  assert.equal(calls[0].url.searchParams.get('teamId'), config.orgId);
  assert.equal(calls[1].options.method, 'GET');
});

test('fails closed for API authentication errors without printing response secrets', async () => {
  await assert.rejects(deployFromGit(config, {
    fetchImpl: apiSequence([{ status: 401, body: { error: { message: config.token } } }]),
  }), (error) => /401/.test(error.message) && !error.message.includes(config.token));
});

test('reports failed builds instead of claiming deployment succeeded', async () => {
  await assert.rejects(deployFromGit(config, {
    fetchImpl: apiSequence([{ body: { id: 'dpl_example', readyState: 'ERROR' } }]),
  }), /ERROR/);
});

test('stops waiting when a deployment never becomes ready', async () => {
  await assert.rejects(deployFromGit(config, {
    fetchImpl: apiSequence([{ body: { id: 'dpl_example', readyState: 'BUILDING' } }]),
    pollLimit: 0,
  }), /Timed out/);
});

test('rejects missing credentials and invalid commit IDs before contacting Vercel', async () => {
  const fetchImpl = () => { throw new Error('Must not contact Vercel'); };
  await assert.rejects(deployFromGit({ ...config, token: '' }, { fetchImpl }), /token/);
  await assert.rejects(deployFromGit({ ...config, sha: 'main' }, { fetchImpl }), /commit/);
});

test('does not treat personal account IDs as team IDs', async () => {
  const calls = [];
  await deployFromGit({ ...config, orgId: 'user_example' }, {
    fetchImpl: apiSequence([{ body: { id: 'dpl_example', readyState: 'READY', aliasAssigned: true, url: 'showlio-example.vercel.app' } }], calls),
  });
  assert.equal(calls[0].url.searchParams.has('teamId'), false);
});

test('waits for production aliases even after the artifact is ready', async () => {
  const calls = [];
  await deployFromGit(config, {
    fetchImpl: apiSequence([
      { body: { id: 'dpl_example', readyState: 'READY', aliasAssigned: false, url: 'showlio-example.vercel.app' } },
      { body: { id: 'dpl_example', readyState: 'READY', aliasAssigned: true, url: 'showlio-example.vercel.app' } },
    ], calls),
    wait: async () => {},
  });
  assert.equal(calls.length, 2);
});

test('reports production alias failures even when the artifact is ready', async () => {
  await assert.rejects(deployFromGit(config, {
    fetchImpl: apiSequence([{ body: {
      id: 'dpl_example', readyState: 'READY', url: 'showlio-example.vercel.app',
      aliasAssigned: false, aliasError: { code: 'alias_error' },
    } }]),
  }), /alias/i);
});
