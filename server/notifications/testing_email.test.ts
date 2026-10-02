import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEV_TESTING_EMAIL,
  IncidentNotificationService,
  incidentNotificationService
} from './notificationService';
import { Incident } from '../../src/types/index';

test('Development Testing Email Isolation Suite', async (t) => {
  await t.test('provides testing email under development/test environment', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const email = incidentNotificationService.getTestingEmail();
      assert.equal(email, DEV_TESTING_EMAIL);
      assert.equal(email, 'dev-testing@skyops.internal');
      assert.equal(incidentNotificationService.isTestingEmail('dev-testing@skyops.internal'), true);
      assert.equal(incidentNotificationService.isTestingEmail('user@company.com'), false);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  await t.test('strictly withholds testing email in production environment (returns null)', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const email = incidentNotificationService.getTestingEmail();
      assert.equal(email, null, 'Testing email must be null in production');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  await t.test('successfully sends test notification to testing email in development', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const result = await incidentNotificationService.sendTestNotification(
        'dev-testing@skyops.internal',
        'Test Dev Org',
        'org-dev-test'
      );
      assert.equal(result.success, true);
      assert.ok(result.messageId);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  await t.test('prohibits sending to development testing email in production environment', async () => {
    const previous = process.env.NODE_ENV;
    const prevAppUrl = process.env.APP_URL;
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://app.skyops.io';
    try {
      await assert.rejects(
        async () => {
          await incidentNotificationService.sendTestNotification(
            'dev-testing@skyops.internal',
            'Prod Org',
            'org-prod-1'
          );
        },
        /Development testing emails are prohibited in production environment/
      );
    } finally {
      process.env.NODE_ENV = previous;
      if (prevAppUrl) process.env.APP_URL = prevAppUrl;
      else delete process.env.APP_URL;
    }
  });

  await t.test('filters out testing emails from live incident dispatch in production', async () => {
    const previous = process.env.NODE_ENV;
    const prevAppUrl = process.env.APP_URL;
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://app.skyops.io';
    try {
      const sampleIncident: Incident = {
        id: 'SKY-TEST-999',
        fingerprint: 'fp-test-999',
        orgId: 'org-prod-1',
        clusterId: 'cluster-prod-1',
        clusterName: 'prod-cluster',
        namespace: 'default',
        resourceKind: 'Pod',
        resourceName: 'payment-service',
        incidentType: 'CrashLoopBackOff',
        title: 'Production Alert Sample',
        severity: 'CRITICAL',
        status: 'OPEN',
        occurrenceCount: 1,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
        updatedAt: Date.now(),
        technicalDetails: {}
      };

      const results = await incidentNotificationService.dispatchIncidentNotification(sampleIncident, {
        orgName: 'Production Org',
        recipients: [
          {
            userId: 'user-dev-test',
            email: 'dev-testing@skyops.internal',
            incidentEmailEnabled: true
          }
        ]
      });

      // Since the only recipient was a testing email, in production it must be filtered out (0 sent)
      assert.equal(results.length, 0, 'Must not dispatch incident notifications to testing emails in production');
    } finally {
      process.env.NODE_ENV = previous;
      if (prevAppUrl) process.env.APP_URL = prevAppUrl;
      else delete process.env.APP_URL;
    }
  });

  await t.test('prohibits initializing NotificationService with testing email sender in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(
        () => {
          new IncidentNotificationService({
            senderEmail: 'dev-testing@skyops.internal',
            appUrl: 'https://app.skyops.io'
          });
        },
        /Development testing email cannot be used as production sender/
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
