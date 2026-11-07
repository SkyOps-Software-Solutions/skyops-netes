-- ============================================================================
-- SkyOps PostgreSQL Database Migration: 002_license_and_ai_config.sql
-- Compatible with PostgreSQL 14, 15, and 16
-- Commercial Licensing, Configurable AI Providers & Update History Schema
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Commercial Licenses & Offline Entitlements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commercial_licenses (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    edition VARCHAR(32) NOT NULL DEFAULT 'COMMUNITY',
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    is_perpetual BOOLEAN NOT NULL DEFAULT FALSE,
    max_clusters INTEGER NOT NULL DEFAULT 3,
    max_nodes INTEGER NOT NULL DEFAULT 30,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_license JSONB NOT NULL,
    signature TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    imported_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_commercial_licenses_org ON commercial_licenses(organization_id, status);

-- ----------------------------------------------------------------------------
-- 2. Configurable AI Providers & Customer Privacy Controls
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_provider_configs (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    provider_type VARCHAR(32) NOT NULL DEFAULT 'none',
    model_name VARCHAR(128) NOT NULL DEFAULT 'gemini-3.8-flash',
    api_endpoint TEXT,
    api_key_encrypted TEXT,
    data_sharing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    strip_sensitive_logs BOOLEAN NOT NULL DEFAULT TRUE,
    redact_environment_vars BOOLEAN NOT NULL DEFAULT TRUE,
    mask_resource_names BOOLEAN NOT NULL DEFAULT FALSE,
    request_timeout_ms INTEGER NOT NULL DEFAULT 15000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_org ON ai_provider_configs(organization_id);

-- ----------------------------------------------------------------------------
-- 3. Software Update History & Version Tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_update_history (
    id VARCHAR(64) PRIMARY KEY,
    from_version VARCHAR(32) NOT NULL,
    to_version VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'STARTED',
    initiated_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    pre_update_backup_path TEXT,
    release_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_system_update_history_created ON system_update_history(created_at DESC);
