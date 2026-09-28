import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  extractJsonString,
  generateValidatedContent,
  GeminiValidationError,
  GeminiProvider
} from '../geminiProvider';
import {
  getContext,
  getRequiredContext,
  runWithContext,
  formatLogHeader,
  createExecutionContext,
  runScopedRemediationTask
} from '../contextBuilder';
import {
  validateTenantBoundary,
  validateAgentTenantBoundary,
  scopeRemediationQueryByTenant,
  UnauthorizedTenantAccessException
} from './auth';

test('Gemini Robustness & Schema Validation Suite', async (t) => {
  await t.test('extractJsonString correctly strips markdown backticks and extracts json', () => {
    const rawMarkdown = '```json\n{"summary": "Pod in CrashLoopBackOff", "confidence": 0.95}\n```';
    const extracted = extractJsonString(rawMarkdown);
    assert.deepEqual(JSON.parse(extracted), {
      summary: 'Pod in CrashLoopBackOff',
      confidence: 0.95
    });

    const embeddedJson = 'Here is the response:\n```\n{"status": "READY"}\n```\nHope that helps!';
    const extractedEmbedded = extractJsonString(embeddedJson);
    assert.deepEqual(JSON.parse(extractedEmbedded), { status: 'READY' });
  });

  await t.test('generateValidatedContent returns typed fallbackValue when API fails or is unconfigured', async () => {
    const TestSchema = z.object({
      action: z.string(),
      retries: z.number()
    });

    const fallback = { action: 'FALLBACK_INSPECT', retries: 0 };
    // Pass empty API key to simulate unconfigured/offline environment
    const result = await generateValidatedContent('Analyze incident', TestSchema, {
      apiKey: '',
      fallbackValue: fallback
    });

    assert.deepEqual(result, fallback);
  });

  await t.test('GeminiValidationError encapsulates issues and status code', () => {
    const dummySchema = z.object({ summary: z.string() });
    const parseResult = dummySchema.safeParse({ summary: 123 });
    assert.equal(parseResult.success, false);
    const issues = !parseResult.success ? parseResult.error.issues : [];

    const err = new GeminiValidationError('Validation failed', issues, '{"summary": 123}');
    assert.equal(err.statusCode, 422);
    assert.equal(err.validationIssues.length, 1);
    assert.equal(err.name, 'GeminiValidationError');
  });

  await t.test('GeminiProvider instance exposes availability and validation wrapper', () => {
    const provider = new GeminiProvider({ apiKey: 'test-key' });
    assert.equal(provider.isAvailable(), true);

    const emptyProvider = new GeminiProvider({ apiKey: '' });
    assert.equal(emptyProvider.isAvailable(), false);
  });
});

test('Context Preservation & Distributed Tracing Suite', async (t) => {
  await t.test('getContext returns undefined when outside of execution context', () => {
    assert.equal(getContext(), undefined);
    assert.throws(() => getRequiredContext(), /Invariant Violation/);
    assert.equal(formatLogHeader(), '[corrId: NONE | tenant: UNKNOWN | user: SYSTEM | ns: default]');
  });

  await t.test('runWithContext preserves correlationId, tenantId, userId, and namespace across async operations', async () => {
    const customCorrelationId = '11111111-2222-3333-4444-555555555555';
    await runWithContext(
      {
        correlationId: customCorrelationId,
        tenantId: 'tenant-enterprise-alpha',
        userId: 'usr-analyst-42',
        namespace: 'production-workloads'
      },
      async () => {
        // Step 1: Immediate verification
        const ctx = getRequiredContext();
        assert.equal(ctx.correlationId, customCorrelationId);
        assert.equal(ctx.tenantId, 'tenant-enterprise-alpha');
        assert.equal(ctx.userId, 'usr-analyst-42');
        assert.equal(ctx.namespace, 'production-workloads');

        // Step 2: Verification across asynchronous delay/microtask
        await new Promise((resolve) => setTimeout(resolve, 10));

        const asyncCtx = getRequiredContext();
        assert.equal(asyncCtx.correlationId, customCorrelationId);
        assert.equal(asyncCtx.tenantId, 'tenant-enterprise-alpha');

        // Step 3: Format log header
        const header = formatLogHeader();
        assert.equal(
          header,
          `[corrId: ${customCorrelationId} | tenant: tenant-enterprise-alpha | user: usr-analyst-42 | ns: production-workloads]`
        );
      }
    );
  });

  await t.test('runScopedRemediationTask binds background execution attributes', async () => {
    await runScopedRemediationTask('tenant-charlie', 'pvc-reclaim', async () => {
      const ctx = getRequiredContext();
      assert.equal(ctx.tenantId, 'tenant-charlie');
      assert.ok(ctx.userId.includes('system:autonomous-remediation:pvc-reclaim'));
      assert.ok(ctx.correlationId.length > 0);
    });
  });
});

test('RBAC & Cross-Tenant Boundary Enforcement Suite', async (t) => {
  await t.test('validateTenantBoundary succeeds when context tenant matches target resource tenant', () => {
    assert.doesNotThrow(() => {
      validateTenantBoundary({ tenantId: 'org-finance-dept' }, 'org-finance-dept');
    });

    assert.doesNotThrow(() => {
      validateTenantBoundary({ orgId: 'org-eng-team' }, 'org-eng-team');
    });
  });

  await t.test('validateTenantBoundary rejects cross-tenant access even for elevated roles', () => {
    const elevatedAdminContext = {
      tenantId: 'tenant-evil-corp',
      userRole: 'OWNER',
      userId: 'admin-root'
    };

    assert.throws(
      () => {
        validateTenantBoundary(elevatedAdminContext, 'tenant-victim-corp');
      },
      (err: any) => {
        assert.ok(err instanceof UnauthorizedTenantAccessException);
        assert.equal(err.statusCode, 403);
        assert.equal(err.tenantId, 'tenant-evil-corp');
        assert.equal(err.targetResourceTenantId, 'tenant-victim-corp');
        assert.match(err.message, /Cross-tenant access denied/);
        return true;
      }
    );
  });

  await t.test('validateAgentTenantBoundary restricts autonomous agent to its registered tenant', () => {
    const validAgentReq: any = {
      clusterId: 'cluster-prod-01',
      orgId: 'tenant-acme-corp'
    };

    assert.doesNotThrow(() => {
      validateAgentTenantBoundary(validAgentReq, 'tenant-acme-corp');
    });

    assert.throws(
      () => {
        validateAgentTenantBoundary(validAgentReq, 'tenant-rival-corp');
      },
      (err: any) => {
        assert.ok(err instanceof UnauthorizedTenantAccessException);
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });

  await t.test('scopeRemediationQueryByTenant enforces tenantId criteria in database queries', () => {
    const unscopedFilter = { status: 'PENDING', riskLevel: 'LOW' };
    const scoped = scopeRemediationQueryByTenant('tenant-infra-99', unscopedFilter);

    assert.equal(scoped.tenantId, 'tenant-infra-99');
    assert.equal(scoped.orgId, 'tenant-infra-99');
    assert.equal(scoped.status, 'PENDING');
    assert.equal(scoped.riskLevel, 'LOW');

    assert.throws(() => {
      scopeRemediationQueryByTenant('');
    }, /missing or invalid tenantId/);
  });
});
