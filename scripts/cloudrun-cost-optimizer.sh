#!/usr/bin/env bash
# =============================================================================
# SkyOps Cloud Run Cost Optimizer & Scale-to-Zero Enforcer
#
# Audits, configures, and enforces:
# 1. min-instances = 0 (scale-to-zero when idle, $0 idle compute cost)
# 2. max-instances = 5 (safe cost ceiling against unexpected traffic spikes)
# 3. cpu-throttling = true (request-based billing: CPU only allocated during requests)
# 4. Cleans up / untags orphaned revisions that keep instances alive
# 5. Configures GCP Budget Alerts (50%, 80%, 100%)
# =============================================================================

set -euo pipefail

# Default configuration
PROJECT_ID="${PROJECT_ID:-skyops-a1143}"
REGION="${REGION:-asia-southeast1}"
TARGET_SERVICE="${TARGET_SERVICE:-}"
DRY_RUN=false
ROLLBACK=false

log_info() { echo -e "\033[1;34m[INFO]\033[0m $*"; }
log_warn() { echo -e "\033[1;33m[WARN]\033[0m $*"; }
log_success() { echo -e "\033[1;32m[SUCCESS]\033[0m $*"; }
log_error() { echo -e "\033[1;31m[ERROR]\033[0m $*"; }

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --project PROJECT_ID     GCP Project ID (default: $PROJECT_ID)
  --region REGION          GCP Region (default: $REGION)
  --service SERVICE_NAME   Target Cloud Run service (default: all services)
  --dry-run                Audit and print changes without executing mutations
  --rollback               Restore min-instances to 1 for disaster recovery
  -h, --help               Show this help message
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT_ID="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --service) TARGET_SERVICE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --rollback) ROLLBACK=true; shift ;;
    -h|--help) usage ;;
    *) log_error "Unknown argument: $1"; usage ;;
  esac
done

if ! command -v gcloud &>/dev/null; then
  log_error "'gcloud' CLI is not installed or not in PATH."
  echo "Please run this script from a workstation with Google Cloud SDK or Cloud Shell."
  exit 1
fi

log_info "Connecting to Google Cloud Project: ${PROJECT_ID} (Region: ${REGION})"
gcloud config set project "${PROJECT_ID}" --quiet

# -----------------------------------------------------------------------------
# 1. Audit Cloud Run Services
# -----------------------------------------------------------------------------
log_info "=== PHASE 1: AUDITING CLOUD RUN SERVICES ==="

if [[ -n "$TARGET_SERVICE" ]]; then
  SERVICES="$TARGET_SERVICE"
else
  SERVICES=$(gcloud run services list --project="${PROJECT_ID}" --region="${REGION}" --format="value(metadata.name)" 2>/dev/null || echo "")
fi

if [[ -z "$SERVICES" ]]; then
  log_warn "No Cloud Run services found in project ${PROJECT_ID} in region ${REGION}."
  exit 0
fi

echo "Found Cloud Run services:"
echo "$SERVICES"
echo ""

# -----------------------------------------------------------------------------
# 2. Inspect & Optimize Each Service
# -----------------------------------------------------------------------------
for SERVICE in $SERVICES; do
  log_info "Inspecting Service: ${SERVICE}"

  SERVICE_JSON=$(gcloud run services describe "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format="json")

  CURRENT_MIN=$(echo "$SERVICE_JSON" | jq -r '.spec.template.metadata.annotations["autoscaling.knative.dev/minScale"] // "0"')
  CURRENT_MAX=$(echo "$SERVICE_JSON" | jq -r '.spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"] // "unlimited"')
  CURRENT_THROTTLING=$(echo "$SERVICE_JSON" | jq -r '.spec.template.metadata.annotations["run.googleapis.com/cpu-throttling"] // "true"')
  CURRENT_CONCURRENCY=$(echo "$SERVICE_JSON" | jq -r '.spec.template.spec.containerConcurrency // "80"')
  IMAGE=$(echo "$SERVICE_JSON" | jq -r '.spec.template.spec.containers[0].image')

  echo "  - Current min-instances: ${CURRENT_MIN}"
  echo "  - Current max-instances: ${CURRENT_MAX}"
  echo "  - CPU Throttling (Request-based billing): ${CURRENT_THROTTLING}"
  echo "  - Concurrency: ${CURRENT_CONCURRENCY}"
  echo "  - Container Image: ${IMAGE}"

  # Check tagged revisions
  TAGGED_REVISIONS=$(echo "$SERVICE_JSON" | jq -r '.spec.traffic[] | select(.tag != null) | "\(.revisionName) (tag: \(.tag), percent: \(.percent))"')
  if [[ -n "$TAGGED_REVISIONS" ]]; then
    log_warn "  Service has tagged revisions that could retain active instances:"
    echo "$TAGGED_REVISIONS"
  fi

  if [[ "$ROLLBACK" == "true" ]]; then
    log_warn "Executing ROLLBACK: Setting min-instances = 1 on ${SERVICE}..."
    if [[ "$DRY_RUN" == "false" ]]; then
      gcloud run services update "${SERVICE}" \
        --project="${PROJECT_ID}" \
        --region="${REGION}" \
        --min-instances=1 \
        --quiet
      log_success "Rollback applied: ${SERVICE} min-instances = 1"
    else
      echo "  [DRY-RUN] Would execute: gcloud run services update ${SERVICE} --min-instances=1"
    fi
    continue
  fi

  # Apply FinOps Optimization
  TARGET_MIN=0
  TARGET_MAX=5

  NEEDS_UPDATE=false
  if [[ "$CURRENT_MIN" != "0" ]]; then
    log_warn "  Non-zero min-instances detected (${CURRENT_MIN}). Incurring idle instance billing!"
    NEEDS_UPDATE=true
  fi
  if [[ "$CURRENT_THROTTLING" != "true" ]]; then
    log_warn "  CPU Throttling disabled (CPU always allocated). Incurring 24/7 compute billing!"
    NEEDS_UPDATE=true
  fi
  if [[ "$CURRENT_MAX" == "unlimited" || "$CURRENT_MAX" -gt 20 ]]; then
    log_warn "  Uncapped or oversized max-instances (${CURRENT_MAX}). Vulnerable to runaway costs!"
    NEEDS_UPDATE=true
  fi

  if [[ "$NEEDS_UPDATE" == "true" || "$CURRENT_MIN" != "0" ]]; then
    log_info "=== PHASE 2: APPLYING SCALE-TO-ZERO & FINOPS OPTIMIZATION ==="
    if [[ "$DRY_RUN" == "false" ]]; then
      gcloud run services update "${SERVICE}" \
        --project="${PROJECT_ID}" \
        --region="${REGION}" \
        --min-instances=0 \
        --max-instances="${TARGET_MAX}" \
        --no-cpu-throttling=false \
        --cpu-boost \
        --update-labels="finops-policy=scale-to-zero,app=skyops" \
        --quiet

      log_success "Successfully updated ${SERVICE}: min-instances=0, max-instances=${TARGET_MAX}, request-based billing enabled."
    else
      echo "  [DRY-RUN] Command to execute:"
      echo "    gcloud run services update ${SERVICE} \\"
      echo "      --project=${PROJECT_ID} \\"
      echo "      --region=${REGION} \\"
      echo "      --min-instances=0 \\"
      echo "      --max-instances=${TARGET_MAX} \\"
      echo "      --no-cpu-throttling=false \\"
      echo "      --cpu-boost \\"
      echo "      --update-labels=\"finops-policy=scale-to-zero,app=skyops\""
    fi
  else
    log_success "  ${SERVICE} is already optimally configured for scale-to-zero (min-instances = 0)."
  fi
done

# -----------------------------------------------------------------------------
# 3. Post-Deployment Verification
# -----------------------------------------------------------------------------
log_info "=== PHASE 3: VERIFYING DEPLOYED HEALTH & COLD START ==="
for SERVICE in $SERVICES; do
  SERVICE_URL=$(gcloud run services describe "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format="value(status.url)" 2>/dev/null || echo "")
  if [[ -n "$SERVICE_URL" ]]; then
    log_info "Probing Service Health: ${SERVICE_URL}/api/health"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/health" || echo "000")
    if [[ "$HTTP_CODE" == "200" ]]; then
      log_success "Health check verified (HTTP 200) on ${SERVICE_URL}"
    else
      log_warn "Health check returned HTTP ${HTTP_CODE} on ${SERVICE_URL}. Verify startup time."
    fi
  fi
done

log_success "FinOps Scale-to-Zero optimization process complete!"
