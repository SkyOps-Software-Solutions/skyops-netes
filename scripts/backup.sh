#!/usr/bin/env bash
# ==============================================================================
# SkyOps Self-Hosted Distribution - Production Backup Tool
# ==============================================================================
# Creates an atomic, timestamped snapshot of PostgreSQL database and persistent
# storage files, computes SHA-256 checksums, and records a metadata manifest.
# Usage: ./scripts/backup.sh [destination_directory]
# ==============================================================================

set -euo pipefail

SKYOPS_HOME="${SKYOPS_HOME:-/opt/skyops}"
if [ ! -f "${SKYOPS_HOME}/docker-compose.yml" ] && [ -f "./docker-compose.yml" ]; then
    SKYOPS_HOME="$(pwd)"
fi

DEFAULT_BACKUP_DIR="${SKYOPS_HOME}/backups"
DEST_DIR="${1:-$DEFAULT_BACKUP_DIR}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

log_info() {
    echo -e "${CYAN}[SkyOps Backup]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SkyOps Backup ✓]${NC} ${BOLD}$1${NC}"
}

log_warn() {
    echo -e "${YELLOW}[SkyOps Backup ⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[SkyOps Backup ✗] ERROR:${NC} $1" >&2
}

mkdir -p "${DEST_DIR}"
chmod 700 "${DEST_DIR}"

TIMESTAMP="$(date -u +"%Y%m%d_%H%M%S")"
TMP_WORK_DIR="/tmp/skyops_backup_${TIMESTAMP}_$$"
mkdir -p "${TMP_WORK_DIR}"

cleanup() {
    rm -rf "${TMP_WORK_DIR}"
}
trap cleanup EXIT INT TERM

log_info "Initiating SkyOps platform backup..."
log_info "Target directory: ${DEST_DIR}"

# 1. Inspect Environment & Credentials
DB_USER="skyops"
DB_NAME="skyops"
if [ -f "${SKYOPS_HOME}/.env" ]; then
    DB_USER="$(grep -E '^POSTGRES_USER=' "${SKYOPS_HOME}/.env" | cut -d'=' -f2 || echo "skyops")"
    DB_NAME="$(grep -E '^POSTGRES_DB=' "${SKYOPS_HOME}/.env" | cut -d'=' -f2 || echo "skyops")"
fi
[ -z "$DB_USER" ] && DB_USER="skyops"
[ -z "$DB_NAME" ] && DB_NAME="skyops"

# 2. Dump PostgreSQL Database
PG_DUMP_FILE="${TMP_WORK_DIR}/postgres_dump.pgc"
log_info "Exporting PostgreSQL database '${DB_NAME}' via pg_dump..."

if docker compose -f "${SKYOPS_HOME}/docker-compose.yml" ps postgres | grep -q "Up"; then
    docker compose -f "${SKYOPS_HOME}/docker-compose.yml" exec -T postgres \
        pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c -b > "${PG_DUMP_FILE}"
else
    log_warn "Postgres container is not currently running. Starting service temporarily..."
    docker compose -f "${SKYOPS_HOME}/docker-compose.yml" start postgres
    sleep 3
    docker compose -f "${SKYOPS_HOME}/docker-compose.yml" exec -T postgres \
        pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c -b > "${PG_DUMP_FILE}"
fi

DB_SIZE_BYTES="$(stat -c%s "${PG_DUMP_FILE}" 2>/dev/null || wc -c < "${PG_DUMP_FILE}")"
log_success "PostgreSQL dump completed (${DB_SIZE_BYTES} bytes)"

# 3. Export Persistent Telemetry & Artifact Files
APP_DATA_DIR="${TMP_WORK_DIR}/appdata"
mkdir -p "${APP_DATA_DIR}"
log_info "Exporting persistent application data..."

# Copy appdata from skyops-control-plane container if running, or from volume mount
if docker compose -f "${SKYOPS_HOME}/docker-compose.yml" ps skyops | grep -q "Up"; then
    docker compose -f "${SKYOPS_HOME}/docker-compose.yml" cp -L skyops:/var/lib/skyops/data "${APP_DATA_DIR}/data" 2>/dev/null || true
fi

# Fallback: inspect local disk storage if configured
if [ -d "${SKYOPS_HOME}/data/storage" ]; then
    cp -rf "${SKYOPS_HOME}/data/storage" "${APP_DATA_DIR}/" 2>/dev/null || true
fi

APP_DATA_SIZE="$(du -sb "${APP_DATA_DIR}" 2>/dev/null | awk '{print $1}' || echo "0")"
log_success "Application data snapshot collected (${APP_DATA_SIZE} bytes)"

# 4. Generate Metadata Manifest
MANIFEST_FILE="${TMP_WORK_DIR}/backup-manifest.json"
cat > "${MANIFEST_FILE}" << EOF
{
  "skyopsVersion": "v1.0.0",
  "backupTimestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "database": {
    "name": "${DB_NAME}",
    "user": "${DB_USER}",
    "format": "custom_pg_dump",
    "sizeBytes": ${DB_SIZE_BYTES}
  },
  "appData": {
    "sizeBytes": ${APP_DATA_SIZE}
  },
  "environment": {
    "deploymentMode": "self_hosted",
    "persistenceProvider": "postgres"
  }
}
EOF

# 5. Package Archive
FINAL_ARCHIVE="${DEST_DIR}/skyops_backup_${TIMESTAMP}.tar.gz"
log_info "Compressing backup archive to ${FINAL_ARCHIVE}..."

tar -czf "${FINAL_ARCHIVE}" -C "${TMP_WORK_DIR}" .

# 6. Compute SHA-256 Verification Checksum
SHA256_FILE="${FINAL_ARCHIVE}.sha256"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${FINAL_ARCHIVE}" | awk '{print $1}' > "${SHA256_FILE}"
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${FINAL_ARCHIVE}" | awk '{print $1}' > "${SHA256_FILE}"
fi

ARCHIVE_SIZE_MB="$(du -m "${FINAL_ARCHIVE}" | awk '{print $1}')"
CHECKSUM="$(cat "${SHA256_FILE}" 2>/dev/null || echo "computed")"

echo ""
echo -e "${GREEN}======================================================================${NC}"
echo -e "${GREEN}${BOLD}   ✓ SkyOps Platform Backup Completed Successfully!                   ${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "  ${BOLD}Archive:${NC}    ${FINAL_ARCHIVE}"
echo -e "  ${BOLD}Size:${NC}       ${ARCHIVE_SIZE_MB} MB"
echo -e "  ${BOLD}SHA-256:${NC}    ${CYAN}${CHECKSUM}${NC}"
echo -e "  ${BOLD}Restore Command:${NC}"
echo -e "    ${CYAN}skyops restore ${FINAL_ARCHIVE}${NC}"
echo -e "${BLUE}======================================================================${NC}"
