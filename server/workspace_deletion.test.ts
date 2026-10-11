import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { DataStore } from './store.js';

process.env.NODE_ENV = 'test';
process.env.SKYOPS_ALLOW_DEMO_AUTH = 'true';

const { app } = await import('../server.js');

const makeToken = (email: string, name: string) =>
  `sky_demo_sre_OWNER_${encodeURIComponent(email)}_${encodeURIComponent(name)}`;

test('Workspace creation, deletion, and invited-member isolation lifecycle', async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  t.after(() => server.close());

  const creatorEmail = `creator-${Date.now()}@example.com`;
  const creatorName = 'Alice Creator';
  const creatorToken = makeToken(creatorEmail, creatorName);

  const invitedEmail = `invited-${Date.now()}@example.com`;
  const invitedName = 'Bob Invited';
  const invitedToken = makeToken(invitedEmail, invitedName);

  // 1. Creator creates a new workspace
  const createRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creatorToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: 'Alice Engineering' })
  });
  assert.equal(createRes.status, 201);
  const { organization: createdOrg } = await createRes.json();
  assert.ok(createdOrg.id);
  assert.equal(createdOrg.isCreatedByMe, true);
  assert.equal(createdOrg.canDelete, true);
  assert.equal(createdOrg.canLeave, false);

  // 2. Creator invites Bob to this workspace
  const inviteRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs/members/invite`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creatorToken}`,
      'x-org-id': createdOrg.id,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: invitedEmail, role: 'ADMIN' })
  });
  assert.equal(inviteRes.status, 201);
  const { invitation } = await inviteRes.json();

  // 3. Bob accepts the invitation
  const acceptRes = await fetch(`http://127.0.0.1:${port}/api/v1/users/me/invitations/${invitation.id}/accept`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${invitedToken}`,
      'Content-Type': 'application/json'
    }
  });
  assert.equal(acceptRes.status, 200);

  // 4. Bob checks his workspaces
  const bobOrgsRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs`, {
    headers: { Authorization: `Bearer ${invitedToken}` }
  });
  assert.equal(bobOrgsRes.status, 200);
  const { organizations: bobOrgs } = await bobOrgsRes.json();
  const aliceWorkspaceForBob = bobOrgs.find((o: any) => o.id === createdOrg.id);
  assert.ok(aliceWorkspaceForBob);
  assert.equal(aliceWorkspaceForBob.canDelete, false);
  assert.equal(aliceWorkspaceForBob.canLeave, true);
  assert.equal(aliceWorkspaceForBob.isCreatedByMe, false);

  // 5. Bob tries to delete Alice's workspace -> MUST BE FORBIDDEN (403)
  const bobDeleteRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs/${createdOrg.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${invitedToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ confirmName: 'Alice Engineering', acknowledgement: true })
  });
  assert.equal(bobDeleteRes.status, 403);
  const bobDeleteError = await bobDeleteRes.json();
  assert.equal(bobDeleteError.code, 'CANNOT_DELETE_INVITED_WORKSPACE');
  assert.equal(bobDeleteError.canLeave, true);
  assert.match(bobDeleteError.error, /Only the person who created this workspace can delete it/i);

  // 6. Bob leaves Alice's workspace
  const bobLeaveRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs/${createdOrg.id}/leave`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${invitedToken}`,
      'Content-Type': 'application/json'
    }
  });
  assert.equal(bobLeaveRes.status, 200);

  // 7. Creator deletes her workspace using 'delete' confirmation keyword
  const creatorDeleteRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs/${createdOrg.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${creatorToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ confirmName: 'delete', acknowledgement: true })
  });
  assert.equal(creatorDeleteRes.status, 200);
  const creatorDeleteBody = await creatorDeleteRes.json();
  assert.equal(creatorDeleteBody.success, true);

  // 8. Subsequent query confirms Alice has no remaining workspaces
  const creatorCheckRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs`, {
    headers: { Authorization: `Bearer ${creatorToken}` }
  });
  assert.equal(creatorCheckRes.status, 200);
  const { organizations: remainingCreatorOrgs } = await creatorCheckRes.json();
  assert.equal(remainingCreatorOrgs.length, 0);
});

test('Workspace deletion rejects mismatched confirmation and accepts normalized quotes', async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  t.after(() => server.close());

  const userEmail = `quotes-${Date.now()}@example.com`;
  const token = makeToken(userEmail, "Dave O'Connor");

  // Create workspace with apostrophe
  const createRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: "Dave's Team" })
  });
  assert.equal(createRes.status, 201);
  const { organization: org } = await createRes.json();

  // Rejects wrong name
  const wrongRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs/${org.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmName: 'Wrong Name', acknowledgement: true })
  });
  assert.equal(wrongRes.status, 400);

  // Accepts curly apostrophe: "Dave’s Team"
  const curlyRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs/${org.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmName: "Dave’s Team", acknowledgement: true })
  });
  assert.equal(curlyRes.status, 200);
  const body = await curlyRes.json();
  assert.equal(body.success, true);
});
