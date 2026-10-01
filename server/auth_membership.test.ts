import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.SKYOPS_ALLOW_DEMO_AUTH = 'true';

const { app } = await import('../server.js');
const { hasPermission } = await import('./auth.js');

const token = (email: string) =>
  `sky_demo_sre_OWNER_${encodeURIComponent(email)}_${encodeURIComponent('New User')}`;

test('a non-member cannot bootstrap an organization through a privileged resource request', async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  t.after(() => server.close());

  const email = `new-user-${Date.now()}@example.com`;
  const resourceResponse = await fetch(`http://127.0.0.1:${port}/api/v1/clusters`, {
    headers: { Authorization: `Bearer ${token(email)}`, 'x-org-id': 'attacker-selected-org' }
  });
  assert.equal(resourceResponse.status, 403);
  assert.equal((await resourceResponse.json()).code, 'ORG_MEMBERSHIP_REQUIRED');

  // Session establishment remains the intentionally narrow onboarding path.
  const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/v1/auth/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(email)}`, 'content-type': 'application/json' },
    body: '{}'
  });
  assert.equal(sessionResponse.status, 200);
});

test('artifact mutation permission excludes VIEWER while preserving operator workflows', () => {
  assert.equal(hasPermission('VIEWER', 'artifact.manage'), false);
  assert.equal(hasPermission('OPERATOR', 'artifact.manage'), true);
  assert.equal(hasPermission('ENGINEER', 'artifact.manage'), true);
  assert.equal(hasPermission('ADMIN', 'artifact.manage'), true);
  assert.equal(hasPermission('OWNER', 'artifact.manage'), true);
});
