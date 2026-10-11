import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.SKYOPS_ALLOW_DEMO_AUTH = 'true';

const { app } = await import('../server.js');

const tokenFor = (email: string, role = 'OWNER', name = 'Test User') =>
  `sky_demo_sre_${role}_${encodeURIComponent(email)}_${encodeURIComponent(name)}`;

test('workspace deletion and invitation permission lifecycle', async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  t.after(() => server.close());

  const creatorEmail = `creator-${Date.now()}@example.com`;
  const creatorAuth = tokenFor(creatorEmail, 'OWNER', 'Alice Creator');

  // 1. Creator creates an organization
  const createRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creatorAuth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: 'Alice Engineering Org' })
  });
  assert.equal(createRes.status, 201);
  const createdOrg = (await createRes.json()).organization;
  assert.ok(createdOrg.id);

  // 2. Creator invites another user (Bob)
  const invitedEmail = `invited-${Date.now()}@example.com`;
  const invitedAuth = tokenFor(invitedEmail, 'OWNER', 'Bob Invited');

  const inviteRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs/members/invite`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creatorAuth}`,
      'Content-Type': 'application/json',
      'x-org-id': createdOrg.id
    },
    body: JSON.stringify({
      email: invitedEmail,
      role: 'ADMIN'
    })
  });
  assert.equal(inviteRes.status, 201);
  const invitation = (await inviteRes.json()).invitation;

  // 3. Bob accepts the invitation
  const acceptRes = await fetch(`http://127.0.0.1:${port}/api/v1/invitations/accept`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${invitedAuth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token: invitation.token
    })
  });
  assert.equal(acceptRes.status, 200);

  // 4. Bob (the invited member) tries to delete Alice's organization -> MUST BE REJECTED with 403
  const forbiddenDeleteRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs/${createdOrg.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${invitedAuth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      confirmName: 'delete',
      acknowledgement: true
    })
  });
  assert.equal(forbiddenDeleteRes.status, 403);
  const forbiddenJson = await forbiddenDeleteRes.json();
  assert.equal(forbiddenJson.code, 'CANNOT_DELETE_INVITED_WORKSPACE');
  assert.equal(forbiddenJson.canLeave, true);

  // 5. Bob CAN leave the organization
  const leaveRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs/${createdOrg.id}/leave`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${invitedAuth}`,
      'Content-Type': 'application/json'
    }
  });
  assert.equal(leaveRes.status, 200);

  // 6. Alice (the creator) CAN delete the organization using "delete" keyword
  const creatorDeleteRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs/${createdOrg.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${creatorAuth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      confirmName: 'delete',
      acknowledgement: true
    })
  });
  assert.equal(creatorDeleteRes.status, 200);
  const deleteJson = await creatorDeleteRes.json();
  assert.equal(deleteJson.success, true);
});
