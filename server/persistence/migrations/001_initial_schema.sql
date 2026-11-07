-- ============================================================================
-- SkyOps PostgreSQL Database Migration: 001_initial_schema.sql
-- Compatible with PostgreSQL 14, 15, and 16
-- Multi-Tenant Kubernetes Incident Intelligence & Control Plane Schema
-- ============================================================================

-- Ensure uuid-ossp or pgcrypto extension is available if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. Users & Local Authentication
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS local_credentials (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    password_algo VARCHAR(32) NOT NULL DEFAULT 'bcrypt',
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_notification_settings (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Organizations, Memberships & Invitations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    owner_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

CREATE TABLE IF NOT EXISTS org_members (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);

CREATE TABLE IF NOT EXISTS org_invitations (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    token VARCHAR(128) UNIQUE NOT NULL,
    inviter_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(token);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations(org_id);

-- ----------------------------------------------------------------------------
-- 3. Kubernetes Clusters & Cluster Tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clusters (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    environment VARCHAR(64) DEFAULT 'production',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    version VARCHAR(64),
    agent_version VARCHAR(64),
    last_heartbeat TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clusters_org ON clusters(org_id);

CREATE TABLE IF NOT EXISTS cluster_tokens (
    id VARCHAR(64) PRIMARY KEY,
    token_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256
    cluster_id VARCHAR(64) NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cluster_tokens_hash ON cluster_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_cluster_tokens_cluster ON cluster_tokens(cluster_id);

CREATE TABLE IF NOT EXISTS cluster_resources (
    cluster_id VARCHAR(64) PRIMARY KEY REFERENCES clusters(id) ON DELETE CASCADE,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    resources JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cluster_resources_org ON cluster_resources(org_id);

CREATE TABLE IF NOT EXISTS cluster_metric_history (
    id VARCHAR(64) PRIMARY KEY,
    cluster_id VARCHAR(64) NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_cluster_metric_hist ON cluster_metric_history(cluster_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cluster_metric_org ON cluster_metric_history(org_id, timestamp DESC);

-- ----------------------------------------------------------------------------
-- 4. Incident Management & History
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cluster_id VARCHAR(64) NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'INVESTIGATING',
    namespace VARCHAR(255),
    affected_resources JSONB NOT NULL DEFAULT '[]'::jsonb,
    root_cause TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_incidents_org ON incidents(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_cluster ON incidents(cluster_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);

CREATE TABLE IF NOT EXISTS incident_timeline (
    id VARCHAR(64) PRIMARY KEY,
    incident_id VARCHAR(64) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    actor VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_incident_timeline_inc ON incident_timeline(incident_id, timestamp ASC);

CREATE TABLE IF NOT EXISTS incident_notes (
    id VARCHAR(64) PRIMARY KEY,
    incident_id VARCHAR(64) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incident_notes_inc ON incident_notes(incident_id, created_at ASC);

-- ----------------------------------------------------------------------------
-- 5. Remediation Workflows, Policies & AI
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS remediations (
    incident_id VARCHAR(64) PRIMARY KEY REFERENCES incidents(id) ON DELETE CASCADE,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    remediation_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS remediation_actions (
    id VARCHAR(64) PRIMARY KEY,
    incident_id VARCHAR(64) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cluster_id VARCHAR(64) NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    target_resource JSONB NOT NULL,
    idempotency_key VARCHAR(128) UNIQUE,
    requested_by VARCHAR(255),
    approved_by VARCHAR(255),
    execution_result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_remediation_actions_inc ON remediation_actions(incident_id);
CREATE INDEX IF NOT EXISTS idx_remediation_actions_key ON remediation_actions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_remediation_actions_org ON remediation_actions(org_id, status);

CREATE TABLE IF NOT EXISTS ai_analyses (
    incident_id VARCHAR(64) PRIMARY KEY REFERENCES incidents(id) ON DELETE CASCADE,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    analysis JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policies (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(64) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    definition JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_policies_org ON policies(org_id);

-- ----------------------------------------------------------------------------
-- 6. Audit Trails, Webhooks & Notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id VARCHAR(64),
    actor_email VARCHAR(255),
    actor_role VARCHAR(32),
    action VARCHAR(128) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_org ON audit_events(org_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS webhooks (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    secret VARCHAR(255),
    events JSONB NOT NULL DEFAULT '[]'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(org_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id VARCHAR(64) PRIMARY KEY,
    webhook_id VARCHAR(64) NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status_code INT,
    success BOOLEAN NOT NULL,
    latency_ms INT,
    attempt INT NOT NULL DEFAULT 1,
    error_message TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org ON webhook_deliveries(org_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_hook ON webhook_deliveries(webhook_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS processed_webhooks (
    webhook_id VARCHAR(128) PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. Subscriptions, Invoices & Usage
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    org_id VARCHAR(64) PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id VARCHAR(64) NOT NULL DEFAULT 'self_hosted_enterprise',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    current_period_end TIMESTAMPTZ,
    license_type VARCHAR(64) NOT NULL DEFAULT 'commercial_self_hosted',
    metadata JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    amount NUMERIC(12,2),
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(32),
    invoice_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS org_usage (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    period VARCHAR(32) NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, period)
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    priority VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    category VARCHAR(64),
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_org ON support_tickets(org_id, status);

-- ----------------------------------------------------------------------------
-- 8. Stored Artifacts & Operational Logs (High Frequency / Partitionable)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stored_artifacts (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    category VARCHAR(64) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stored_artifacts_org ON stored_artifacts(org_id, category);

CREATE TABLE IF NOT EXISTS operational_logs (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cluster_id VARCHAR(64) NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    namespace VARCHAR(255),
    workload VARCHAR(255),
    pod_name VARCHAR(255),
    container VARCHAR(255),
    severity VARCHAR(32) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    message TEXT NOT NULL,
    raw JSONB
);
CREATE INDEX IF NOT EXISTS idx_operational_logs_query ON operational_logs(org_id, cluster_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_operational_logs_severity ON operational_logs(severity);
CREATE INDEX IF NOT EXISTS idx_operational_logs_timestamp ON operational_logs(timestamp);
