#!/usr/bin/env bash
# ==============================================================================
# SkyOps Self-Hosted Distribution - Production Restoration Tool
# ==============================================================================
# Restores an atomic backup archive created by backup.sh.
# Verifies SHA-256 checksums, prompts for confirmation, stops application,
# restores PostgreSQL data, and verifies post-restoration health.
# Usage: ./scripts/restore.sh <backup_archive.tar.gz> [--yes]
# ==============================================================================

set -euo pipefail

SKYOPS_HOME="${SKYOPS_HOME:-/opt/skyops}"
if [ ! -f "${SKYOPS_HOME}/docker-compose.yml" ] && [ -f "./docker-compose.yml" ]; then
    SKYOPS_HOME="$(pwd)"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

log_info() {
    echo -e "${CYAN}[SkyOps Restore]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SkyOps Restore ✓]${NC} ${BOLD}$1${NC}"
}

log_warn() {
    echo -e "${YELLOW}[SkyOps Restore ⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[SkyOps Restore ✗] ERROR:${NC} $1" >&2
}

ARCHIVE_PATH="${1:-}"
FORCE_CONFIRM="false"

for arg in "$@"; do
    if [ "$arg" = "--yes" ] || [ "$arg" = "-y" ]; then
        FORCE_CONFIRM="true"
    fi
done

if [ -z "$ARCHIVE_PATH" ] || [ ! -f "$ARCHIVE_PATH" ]; then
    log_error "Please provide a valid backup archive path."
    echo -e "Usage: ${BOLD}skyops restore <path-to-skyops_backup.tar.gz> [--yes]${NC}"
    exit 1
fi

TMP_RESTORE_DIR="/tmp/skyops_restore_${$}_$(date +%s)"
mkdir -p "${TMP_RESTORE_DIR}"

cleanup() {
    rm -rf "${TMP_RESTORE_DIR}"
}
trap cleanup EXIT INT TERM

# 1. Verify Checksum Integrity
SHA256_FILE="${ARCHIVE_PATH}.sha256"
if [ -f "${SHA256_FILE}" ]; then
    log_info "Verifying SHA-256 checksum..."
    EXPECTED_SHA="$(cat "${SHA256_FILE}" | awk '{print $1}')"
    ACTUAL_SHA=""
    if command -v sha256sum >/dev/null 2>&1; then
        ACTUAL_SHA="$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')"
    elif command -v shasum >/dev/null 2>&1; then
        ACTUAL_SHA="$(shasum -a 256 "${ARCHIVE_PATH}" | awk '{print $1}')"
    fi

    if [ -n "$ACTUAL_SHA" ] && [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
        log_error "SHA-256 verification failed! The archive may be corrupted or modified."
        log_error "Expected: ${EXPECTED_SHA}"
        log_error "Actual:   ${ACTUAL_SHA}"
        exit 1
    fi
    log_success "SHA-256 integrity check passed: ${ACTUAL_SHA}"
else
    log_warn "No .sha256 checksum file found beside archive. Proceeding with archive structure validation."
fi

# 2. Extract Archive to Workspace
log_info "Extracting backup archive contents..."
tar -xzf "${ARCHIVE_PATH}" -C "${TMP_RESTORE_DIR}"

MANIFEST_FILE="${TMP_RESTORE_DIR}/backup-manifest.json"
PG_DUMP_FILE="${TMP_RESTORE_DIR}/postgres_dump.pgc"

if [ ! -f "${PG_DUMP_FILE}" ]; then
    log_error "Invalid backup archive: missing PostgreSQL dump (postgres_dump.pgc)."
    exit 1
fi

if [ -f "${MANIFEST_FILE}" ]; then
    log_info "Backup Manifest Details:"
    cat "${MANIFEST_FILE}"
fi

# 3. User Confirmation Safety Gate
if [ "$FORCE_CONFIRM" != "true" ]; then
    echo ""
    echo -e "${RED}${BOLD}======================================================================${NC}"
    echo -e "${RED}${BOLD}   WARNING: RESTORATION WILL OVERWRITE EXISTING PRODUCTION DATA      ${NC}"
    echo -e "${RED}${BOLD}======================================================================${NC}"
    echo -e "This operation will:"
    echo -e "  - Stop the running SkyOps Control Plane service"
    echo -e "  - Replace the PostgreSQL database contents with the backup state"
    echo -e "  - Replace persistent telemetry files and snapshots"
    echo ""
    echo -ne "${YELLOW}Type ${BOLD}RESTORE${NC}${YELLOW} to confirm and proceed: ${NC}"
    read -r confirmation

    if [ "$confirmation" != "RESTORE" ]; then
        log_info "Restoration aborted by user. No data was modified."
        exit 0
    fi
fi

# 4. Read Target Database Configuration
DB_USER="skyops"
DB_NAME="skyops"
if [ -f "${SKYOPS_HOME}/.env" ]; then
    DB_USER="$(grep -E '^POSTGRES_USER=' "${SKYOPS_HOME}/.env" | cut -d'=' -f2 || echo "skyops")"
    DB_NAME="$(grep -E '^POSTGRES_DB=' "${SKYOPS_HOME}/.env" | cut -d'=' -f2 || echo "skyops")"
fi
[ -z "$DB_USER" ] && DB_USER="skyops"
[ -z "$DB_NAME" ] && DB_NAME="skyops"

# 5. Stop Application Service to Relinquish Active DB Connections
log_info "Stopping SkyOps Control Plane service..."
docker compose -f "${SKYOPS_HOME}/docker-compose.yml" stop skyops || true

# Ensure postgres is running
if ! docker compose -f "${SKYOPS_HOME}/docker-compose.yml" ps postgres | grep -q "Up"; then
    log_info "Starting PostgreSQL container..."
    docker compose -f "${SKYOPS_HOME}/docker-compose.yml" up -d postgres
    sleep 3
fi

# 6. Restore Database via pg_restore
log_info "Restoring PostgreSQL database '${DB_NAME}'..."
docker compose -f "${SKYOPS_HOME}/docker-compose.yml" cp "${PG_DUMP_FILE}" postgres:/tmp/restore.pgc

# Terminate any lingering connection locks to target DB
docker compose -f "${SKYOPS_HOME}/docker-compose.yml" exec -T postgres \
    psql -U "${DB_USER}" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true

# Clean existing schema objects and restore cleanly
docker compose -f "${SKYOPS_HOME}/docker-compose.yml" exec -T postgres \
    pg_restore -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner --no-privileges /tmp/restore.pgc || {
        # If clean fails on fresh database, try regular restore without clean
        docker compose -f "${SKYOPS_HOME}/docker-compose.yml" exec -T postgres \
            pg_restore -U "${DB_USER}" -d "${DB_NAME}" --no-owner --no-privileges /tmp/restore.pgc
    }

docker compose -f "${SKYOPS_HOME}/docker-compose.yml" exec -T postgres rm -f /tmp/restore.pgc
log_success "PostgreSQL database successfully restored"

# 7. Restore Persistent Storage Files
if [ -d "${TMP_RESTORE_DIR}/appdata/data" ]; then
    log_info "Restoring application data files..."
    docker compose -f "${SKYOPS_HOME}/docker-compose.yml" cp "${TMP_RESTORE_DIR}/appdata/data/." skyops:/var/lib/skyops/data/ 2>/dev/null || true
fi
if [ -d "${TMP_RESTORE_DIR}/appdata/storage" ] && [ -d "${SKYOPS_HOME}/data/storage" ]; then
    cp -rf "${TMP_RESTORE_DIR}/appdata/storage/"* "${SKYOPS_HOME}/data/storage/" 2>/dev/null || true
fi

# 8. Restart Application and Verify Health
log_info "Starting SkyOps Control Plane service..."
docker compose -f "${SKYOPS_HOME}/docker-compose.yml" up -d skyops

log_info "Verifying service readiness..."
PORT="3000"
if [ -f "${SKYOPS_HOME}/.env" ]; then
    PORT="$(grep -E '^SKYOPS_PORT=' "${SKYOPS_HOME}/.env" | cut -d'=' -f2 || echo "3000")"
    [ -z "$PORT" ] && PORT="3000"
fi

attempts=0
is_ready=false
while [ "$attempts" -lt 25 ]; do
    attempts=$((attempts + 1))
    sleep 2
    if curl -fsSL "http://127.0.0.1:${PORT}/api/v1/auth/status" >/dev/null 2>&1; then
        is_ready=true
        break
    fi
    echo -ne "."
done
echo ""

if [ "$is_ready" = "true" ]; then
    echo ""
    echo -e "${GREEN}======================================================================${NC}"
    echo -e "${GREEN}${BOLD}   ✓ SkyOps Platform Successfully Restored!                           ${NC}"
    echo -e "${GREEN}======================================================================${NC}"
    echo -e "  Restored from: ${ARCHIVE_PATH}"
    echo -e "  Dashboard URL: http://127.0.0.1:${PORT}"
    echo -e "${BLUE}======================================================================${NC}"
else
    log_warn "SkyOps service restarted, but health check is taking longer than expected."
    echo -e "Check logs with: ${BOLD}docker compose -f ${SKYOPS_HOME}/docker-compose.yml logs skyops${NC}"
fi
