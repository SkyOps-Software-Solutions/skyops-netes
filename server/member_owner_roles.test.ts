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

test('Member and Owner role system: administrative actions & deletion restricted to original creator/owner', async () => {
  const { baseUrl, close } = await startTestServer();

  try {
    const creatorAlice = { id: 'usr-alice-creator', email: 'alice.creator@example.com', name: 'Alice Creator' };
    const memberBob = { id: 'usr-bob-member', email: 'bob.member@example.com', name: 'Bob Member' };
    const coOwnerCharlie = { id: 'usr-charlie-owner', email: 'charlie.owner@example.com', name: 'Charlie CoOwner' };

    store.upsertUser(creatorAlice);
    store.upsertUser(memberBob);
    store.upsertUser(coOwnerCharlie);

    const aliceToken = createMockToken(creatorAlice);
    const bobToken = createMockToken(memberBob);
    const charlieToken = createMockToken(coOwnerCharlie);

    // 1. Creator Alice creates workspace "Enterprise Operations"
    const org = store.createOrganization(
      'Enterprise Operations',
      creatorAlice.id,
      creatorAlice.email,
      creatorAlice.name
    );

    assert.equal(org.name, 'Enterprise Operations');
    assert.equal(org.ownerUserId, creatorAlice.id);
    assert.equal(org.creatorUserId, creatorAlice.id);

    // Verify Alice's initial role is OWNER
    const aliceMembers = store.getOrgMembers(org.id);
    const aliceRecord = aliceMembers.find((m) => m.userId === creatorAlice.id);
    assert.ok(aliceRecord, 'Alice should be recorded as member');
    assert.equal(aliceRecord?.role, 'OWNER', 'Workspace creator must have OWNER role');

    // Verify Alice's organization view
    const aliceOrgs = store.getOrganizationsForUser(creatorAlice.id, creatorAlice.email);
    const aliceOrgView = aliceOrgs.find((o) => o.id === org.id);
    assert.ok(aliceOrgView);
    assert.equal(aliceOrgView?.isCreatedByMe, true);
    assert.equal(aliceOrgView?.canDelete, true);
    assert.equal(aliceOrgView?.canLeave, false);

    // 2. Alice invites Bob as 'MEMBER' (using case-insensitive 'Member')
    const bobInvite = store.inviteMember(org.id, memberBob.email, 'Member', creatorAlice);
    assert.equal(bobInvite.role, 'MEMBER', 'Role should normalize to uppercase MEMBER');
    store.acceptInvitationById(bobInvite.id, memberBob);

    // Verify Bob is now a member with role 'MEMBER'
    const membersAfterBob = store.getOrgMembers(org.id);
    const bobRecord = membersAfterBob.find((m) => m.userId === memberBob.id);
    assert.ok(bobRecord, 'Bob should be an active member');
    assert.equal(bobRecord?.role, 'MEMBER', 'Bob should have role MEMBER');

    // Verify Bob's organization view: cannot delete, can leave
    const bobOrgs = store.getOrganizationsForUser(memberBob.id, memberBob.email);
    const bobOrgView = bobOrgs.find((o) => o.id === org.id);
    assert.ok(bobOrgView);
    assert.equal(bobOrgView?.isCreatedByMe, false);
    assert.equal(bobOrgView?.canDelete, false);
    assert.equal(bobOrgView?.canLeave, true);

    // 3. Bob (MEMBER) attempts administrative actions:
    // a) Deletion must be REJECTED with 403 CANNOT_DELETE_INVITED_WORKSPACE
    const bobDeleteRes = await fetch(`${baseUrl}/api/v1/organizations/${org.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`
      },
      body: JSON.stringify({ confirmName: 'Enterprise Operations', acknowledgement: true })
    });
    assert.equal(bobDeleteRes.status, 403, 'Member must not be allowed to delete workspace');
    const bobDeleteJson = await bobDeleteRes.json();
    assert.equal(bobDeleteJson.code, 'CANNOT_DELETE_INVITED_WORKSPACE');
    assert.equal(bobDeleteJson.canLeave, true);

    // b) Updating organization configuration must be REJECTED with 403 (requires OWNER or ADMIN)
    const bobPatchRes = await fetch(`${baseUrl}/api/v1/organizations/${org.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
        'x-org-id': org.id
      },
      body: JSON.stringify({ name: 'Hacked Workspace' })
    });
    assert.equal(bobPatchRes.status, 403, 'Member must not be allowed to update organization settings');

    // c) Inviting other members must be REJECTED with 403 (requires OWNER or ADMIN)
    const bobInviteRes = await fetch(`${baseUrl}/api/v1/organizations/members/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
        'x-org-id': org.id
      },
      body: JSON.stringify({ email: 'intruder@example.com', role: 'MEMBER' })
    });
    assert.equal(bobInviteRes.status, 403, 'Member must not be allowed to invite new members');

    // d) Updating member role must be REJECTED with 403 (requires OWNER or ADMIN)
    const bobRoleChangeRes = await fetch(`${baseUrl}/api/v1/organizations/members/${creatorAlice.id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
        'x-org-id': org.id
      },
      body: JSON.stringify({ role: 'VIEWER' })
    });
    assert.equal(bobRoleChangeRes.status, 403, 'Member must not be allowed to change member roles');

    // 4. Bob (MEMBER) CAN perform regular member operations:
    // Reading members list
    const bobGetMembersRes = await fetch(`${baseUrl}/api/v1/organizations/members`, {
      headers: {
        Authorization: `Bearer ${bobToken}`,
        'x-org-id': org.id
      }
    });
    assert.equal(bobGetMembersRes.status, 200, 'Member should be allowed to view members list');
    const bobGetMembersJson = await bobGetMembersRes.json();
    assert.ok(bobGetMembersJson.members.length >= 2);

    // 5. Alice invites Charlie with 'OWNER' role (co-owner)
    const charlieInvite = store.inviteMember(org.id, coOwnerCharlie.email, 'OWNER', creatorAlice);
    assert.equal(charlieInvite.role, 'OWNER');
    store.acceptInvitationById(charlieInvite.id, coOwnerCharlie);

    // Verify Charlie has OWNER role
    const membersAfterCharlie = store.getOrgMembers(org.id);
    const charlieRecord = membersAfterCharlie.find((m) => m.userId === coOwnerCharlie.id);
    assert.equal(charlieRecord?.role, 'OWNER');

    // Charlie has OWNER role, but Charlie did NOT create the workspace.
    // Deletion by Charlie must be REJECTED with 403 CANNOT_DELETE_INVITED_WORKSPACE!
    const charlieDeleteRes = await fetch(`${baseUrl}/api/v1/organizations/${org.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${charlieToken}`
      },
      body: JSON.stringify({ confirmName: 'Enterprise Operations', acknowledgement: true })
    });
    assert.equal(charlieDeleteRes.status, 403, 'Invited co-owner must NOT be allowed to delete workspace');
    const charlieDeleteJson = await charlieDeleteRes.json();
    assert.equal(charlieDeleteJson.code, 'CANNOT_DELETE_INVITED_WORKSPACE');

    // 6. Member Bob leaves the workspace -> succeeds
    const bobLeaveRes = await fetch(`${baseUrl}/api/v1/organizations/${org.id}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`
      }
    });
    assert.equal(bobLeaveRes.status, 200, 'Member should successfully leave');

    // 7. Creator Alice attempts to leave her own workspace -> rejected (creator cannot abandon workspace without deleting)
    const aliceLeaveRes = await fetch(`${baseUrl}/api/v1/organizations/${org.id}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`
      }
    });
    assert.equal(aliceLeaveRes.status, 400, 'Creator cannot leave their own workspace');

    // 8. Original Creator Alice deletes the workspace -> succeeds
    const aliceDeleteRes = await fetch(`${baseUrl}/api/v1/organizations/${org.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`
      },
      body: JSON.stringify({ confirmName: 'Enterprise Operations', acknowledgement: true })
    });
    assert.equal(aliceDeleteRes.status, 200, 'Creator must be able to delete workspace');
    const aliceDeleteJson = await aliceDeleteRes.json();
    assert.equal(aliceDeleteJson.success, true);

    // 9. Verify workspace is permanently deleted
    assert.equal(store.getOrganization(org.id), null, 'Workspace should be permanently removed');
  } finally {
    await close();
    process.exit(0);
  }
});
