process.env.NODE_ENV = 'test';
process.env.SKYOPS_ALLOW_DEMO_AUTH = 'true';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { store } from './store';
import { app } from '../server';
import http from 'http';
import jwt from 'jsonwebtoken';

function createMockToken(user: { id: string; email: string; name: string }) {
  return jwt.sign(
    {
      sub: user.id,
      user_id: user.id,
      email: user.email,
      name: user.name,
      email_verified: true,
      aud: 'skyops-test',
      iss: 'https://securetoken.google.com/skyops-test'
    },
    'mock-secret-key-for-test-suites-only-32b',
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

async function startTestServer() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

test('Workspace deletion & leave permissions: creator can delete, invited member cannot delete but can leave', async () => {
  const { baseUrl, close } = await startTestServer();

  try {
    const creatorUser = { id: 'usr-creator-1', email: 'creator@example.com', name: 'Creator Alice' };
    const invitedUser = { id: 'usr-invited-1', email: 'invited@example.com', name: 'Invited Bob' };

    store.upsertUser(creatorUser);
    store.upsertUser(invitedUser);

    const creatorToken = createMockToken(creatorUser);
    const invitedToken = createMockToken(invitedUser);

    // 1. Creator Alice creates workspace "Alpha Platform"
    const org = store.createOrganization(
      'Alpha Platform',
      creatorUser.id,
      creatorUser.email,
      creatorUser.name
    );

    assert.equal(org.name, 'Alpha Platform');
    assert.equal(org.ownerUserId, creatorUser.id);
    assert.equal(org.ownerEmail, creatorUser.email);

    // 2. Alice invites Bob to "Alpha Platform" with OWNER role
    const invite = store.inviteMember(org.id, invitedUser.email, 'OWNER', creatorUser);
    // Bob accepts the invitation
    store.acceptInvitationById(invite.id, invitedUser);

    // Verify Bob is a member with role OWNER
    const members = store.getOrgMembers(org.id);
    const bobMember = members.find((m) => m.userId === invitedUser.id);
    assert.ok(bobMember, 'Bob should be an active member');
    assert.equal(bobMember?.role, 'OWNER');

    // Verify Bob's getOrganizationsForUser reflects invited status: cannot delete, can leave
    const bobOrgs = store.getOrganizationsForUser(invitedUser.id, invitedUser.email);
    const bobOrgView = bobOrgs.find((o) => o.id === org.id);
    assert.ok(bobOrgView, 'Bob should see the organization');
    assert.equal(bobOrgView?.isCreatedByMe, false, 'Bob should not be marked as creator');
    assert.equal(bobOrgView?.canDelete, false, 'Bob should not be allowed to delete');
    assert.equal(bobOrgView?.canLeave, true, 'Bob should be allowed to leave');

    // Verify Alice's getOrganizationsForUser reflects creator status: can delete, cannot leave
    const aliceOrgs = store.getOrganizationsForUser(creatorUser.id, creatorUser.email);
    const aliceOrgView = aliceOrgs.find((o) => o.id === org.id);
    assert.ok(aliceOrgView, 'Alice should see her organization');
    assert.equal(aliceOrgView?.isCreatedByMe, true, 'Alice must be marked as creator');
    assert.equal(aliceOrgView?.canDelete, true, 'Alice must be allowed to delete');
    assert.equal(aliceOrgView?.canLeave, false, 'Alice cannot leave her own workspace');

    // 3. Bob attempts to DELETE "Alpha Platform"
    // Even though Bob has OWNER role, Bob did not create the workspace.
    // The deletion must be REJECTED with 403 CANNOT_DELETE_INVITED_WORKSPACE.
    const bobDeleteRes = await fetch(`${baseUrl}/api/v1/organizations/${org.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${invitedToken}`
      },
      body: JSON.stringify({
        confirmName: 'Alpha Platform',
        acknowledgement: true
      })
    });

    assert.equal(bobDeleteRes.status, 403, 'Invited member must not be allowed to delete workspace');
    const bobDeleteJson = await bobDeleteRes.json();
    assert.equal(bobDeleteJson.code, 'CANNOT_DELETE_INVITED_WORKSPACE');
    assert.equal(bobDeleteJson.canLeave, true);

    // 4. Alice (the creator) attempts to leave her own workspace -> must be rejected
    const aliceLeaveRes = await fetch(`${baseUrl}/api/v1/organizations/${org.id}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creatorToken}`
      }
    });
    assert.equal(aliceLeaveRes.status, 400, 'Creator should not be allowed to leave their own workspace');

    // 5. Bob (the invited member) leaves the workspace -> must succeed
    const bobLeaveRes = await fetch(`${baseUrl}/api/v1/organizations/${org.id}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${invitedToken}`
      }
    });
    assert.equal(bobLeaveRes.status, 200, 'Invited member should successfully leave');
    const bobLeaveJson = await bobLeaveRes.json();
    assert.equal(bobLeaveJson.success, true);

    // Verify Bob is no longer a member
    const updatedMembers = store.getOrgMembers(org.id);
    assert.equal(updatedMembers.some((m) => m.userId === invitedUser.id), false);

    // 6. Alice (the creator) deletes her workspace with case-insensitive confirmation name -> must succeed
    const aliceDeleteRes = await fetch(`${baseUrl}/api/v1/orgs/${org.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creatorToken}`
      },
      body: JSON.stringify({
        confirmName: 'alpha platform', // case-insensitive match
        acknowledgement: true
      })
    });

    assert.equal(aliceDeleteRes.status, 200, 'Creator must be able to delete their own workspace');
    const aliceDeleteJson = await aliceDeleteRes.json();
    assert.equal(aliceDeleteJson.success, true);

    // Verify workspace is permanently removed
    assert.equal(store.getOrganization(org.id), null, 'Workspace should be permanently deleted');
  } finally {
    await close();
  }
});
