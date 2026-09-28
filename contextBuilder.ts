/**
 * contextBuilder.ts
 *
 * Context Preservation & Distributed Tracing Module
 *
 * Uses Node.js `async_hooks.AsyncLocalStorage` to maintain and propagate
 * execution context across asynchronous call boundaries (e.g. downstream Gemini API calls,
 * Kubernetes queries, and background database writes) without manual parameter drilling.
 *
 * Trace Identity Invariants:
 * - correlationId: UUID string for end-to-end distributed log correlation
 * - tenantId: String identifying the organization/tenant for boundary isolation
 * - userId: String identifying the execution principal or autonomous service account
 * - namespace: String identifying the Kubernetes or operational execution zone
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Execution Context structure carried by all asynchronous operations.
 */
export interface ExecutionContext {
  /**
   * Unique UUID for end-to-end tracing and distributed log correlation.
   */
  correlationId: string;
  /**
   * Organization / Tenant identifier for boundary validation.
   */
  tenantId: string;
  /**
   * User identifier or autonomous actor ID executing the workflow.
   */
  userId: string;
  /**
   * Kubernetes or logical operational namespace.
   */
  namespace: string;
  /**
   * Optional contextual metadata (clusterId, incidentId, traceFlags, etc.)
   */
  metadata?: Record<string, unknown>;
}

/**
 * Global AsyncLocalStorage singleton instance.
 */
export const contextStorage = new AsyncLocalStorage<ExecutionContext>();

/**
 * Retrieves the current execution context from AsyncLocalStorage.
 * Returns undefined if called outside of an active trace context.
 */
export function getContext(): ExecutionContext | undefined {
  return contextStorage.getStore();
}

/**
 * Retrieves the current execution context, throwing an error if no context is active.
 */
export function getRequiredContext(): ExecutionContext {
  const ctx = getContext();
  if (!ctx) {
    throw new Error(
      '[ContextBuilder] Invariant Violation: Operation required an active ExecutionContext, but none was active in AsyncLocalStorage.'
    );
  }
  return ctx;
}

/**
 * Runs an asynchronous or synchronous function within a scoped ExecutionContext.
 * Automatically generates a correlationId UUID if not provided.
 *
 * @param context Partial or full execution context attributes
 * @param fn Callback executed within the context
 */
export function runWithContext<R>(
  context: Partial<ExecutionContext> & { tenantId?: string },
  fn: () => R
): R {
  const parent = getContext();

  const effectiveContext: ExecutionContext = {
    correlationId: context.correlationId || parent?.correlationId || randomUUID(),
    tenantId: context.tenantId || parent?.tenantId || 'global-system',
    userId: context.userId || parent?.userId || 'system',
    namespace: context.namespace || parent?.namespace || 'default',
    metadata: {
      ...(parent?.metadata || {}),
      ...(context.metadata || {})
    }
  };

  return contextStorage.run(effectiveContext, fn);
}

/**
 * Formats a standardized log header string incorporating current trace context attributes.
 * Useful for loggers, audit trails, and downstream AI analysis wrappers.
 *
 * Output format:
 * `[corrId: <uuid> | tenant: <tenantId> | user: <userId> | ns: <namespace>]`
 */
export function formatLogHeader(customContext?: ExecutionContext): string {
  const ctx = customContext || getContext();
  if (!ctx) {
    return '[corrId: NONE | tenant: UNKNOWN | user: SYSTEM | ns: default]';
  }
  return `[corrId: ${ctx.correlationId} | tenant: ${ctx.tenantId} | user: ${ctx.userId} | ns: ${ctx.namespace}]`;
}

/**
 * Factory helper to construct a valid ExecutionContext object.
 */
export function createExecutionContext(
  params: Partial<ExecutionContext> & { tenantId: string }
): ExecutionContext {
  return {
    correlationId: params.correlationId || randomUUID(),
    tenantId: params.tenantId,
    userId: params.userId || 'system',
    namespace: params.namespace || 'default',
    metadata: params.metadata || {}
  };
}

/**
 * Express middleware that initializes an ExecutionContext for incoming HTTP requests.
 * Extracts correlationId from X-Correlation-ID or X-Request-ID headers,
 * tenantId from authentication credentials or tenant headers, and binds them to the request lifecycle.
 */
export function contextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    randomUUID();

  // Expose correlation ID to client response headers
  res.setHeader('X-Correlation-ID', correlationId);

  const tenantId =
    (req as any).orgId ||
    (req.headers['x-tenant-id'] as string) ||
    (req.headers['x-org-id'] as string) ||
    'unassigned';

  const userId =
    (req as any).user?.id ||
    (req.headers['x-user-id'] as string) ||
    'anonymous';

  const namespace =
    (req.headers['x-namespace'] as string) ||
    (req.query.namespace as string) ||
    'default';

  const context: ExecutionContext = {
    correlationId,
    tenantId,
    userId,
    namespace,
    metadata: {
      path: req.path,
      method: req.method,
      ip: req.ip
    }
  };

  runWithContext(context, () => {
    next();
  });
}

/**
 * Helper to wrap background, cron, or autonomous remediation jobs with strict tenant context.
 * Guarantees that asynchronous callbacks and database queries retain the correct tenant scope.
 */
export function runScopedRemediationTask<R>(
  tenantId: string,
  taskName: string,
  fn: () => Promise<R> | R,
  namespace = 'default'
): Promise<R> | R {
  const context: ExecutionContext = {
    correlationId: randomUUID(),
    tenantId,
    userId: `system:autonomous-remediation:${taskName}`,
    namespace,
    metadata: {
      taskName,
      executedAt: Date.now()
    }
  };

  return runWithContext(context, fn);
}
