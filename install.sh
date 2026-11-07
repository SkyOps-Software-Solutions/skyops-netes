#!/usr/bin/env bash
# ==============================================================================
# SkyOps Self-Hosted Distribution - Official Installation Script
# ==============================================================================
# Supported OS: Ubuntu Server 20.04 LTS, 22.04 LTS, 24.04 LTS (x86_64)
# Target command: curl -fsSL https://get.skyops.io/install.sh | sudo bash
# ==============================================================================

set -euo pipefail

# Visual terminal formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/skyops"
RELEASE_VERSION="${SKYOPS_VERSION:-v1.0.0}"
FORCE_INSTALL="${FORCE_INSTALL:-false}"
DEFAULT_PORT="${SKYOPS_PORT:-3000}"

log_info() {
    echo -e "${CYAN}[SkyOps]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SkyOps ✓]${NC} ${BOLD}$1${NC}"
}

log_warn() {
    echo -e "${YELLOW}[SkyOps ⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[SkyOps ✗] ERROR:${NC} $1" >&2
}

banner() {
    cat << "EOF"
======================================================================
  ____  _             ___              
 / ___|| | _____   _ / _ \ _ __  ___   
 \___ \| |/ / | | | | | | | '_ \/ __|  
  ___) |   <| |_| | | |_| | |_) \__ \  
 |____/|_|\_\\__, |  \___/| .__/|___/  
             |___/        |_|          
   Production Self-Hosted Kubernetes Incident Management Platform
======================================================================
EOF
}

# ------------------------------------------------------------------------------
# 1. Preflight System Checks
# ------------------------------------------------------------------------------
check_root() {
    if [ "$(id -u)" -ne 0 ]; then
        log_error "This installer must be run as root or with sudo privileges."
        echo -e "Please run: ${BOLD}sudo bash install.sh${NC} or ${BOLD}curl -fsSL https://get.skyops.io/install.sh | sudo bash${NC}"
        exit 1
    fi
}

check_architecture() {
    local arch
    arch="$(uname -m)"
    if [ "$arch" != "x86_64" ]; then
        log_error "Unsupported CPU architecture: ${arch}."
        echo -e "SkyOps currently supports 64-bit x86_64 (amd64) Linux architecture."
        exit 1
    fi
    log_success "Verified architecture: x86_64"
}

check_os() {
    if [ ! -f /etc/os-release ]; then
        if [ "$FORCE_INSTALL" = "true" ]; then
            log_warn "Unknown Linux distribution. FORCE_INSTALL=true specified, proceeding at user risk."
            return 0
        fi
        log_error "/etc/os-release not found. SkyOps requires Ubuntu Server (20.04, 22.04, or 24.04)."
        exit 1
    fi

    # shellcheck source=/dev/null
    . /etc/os-release
    local os_id="${ID:-unknown}"
    local os_version="${VERSION_ID:-unknown}"

    log_info "Detected operating system: ${NAME:-Linux} ${VERSION_ID:-}"

    if [ "$os_id" = "ubuntu" ]; then
        case "$os_version" in
            20.04*|22.04*|24.04*)
                log_success "Verified supported Ubuntu release: ${os_version}"
                ;;
            *)
                if [ "$FORCE_INSTALL" = "true" ]; then
                    log_warn "Ubuntu version ${os_version} is not officially certified. Proceeding due to FORCE_INSTALL=true."
                else
                    log_warn "Ubuntu ${os_version} detected. Officially certified versions are 20.04 LTS, 22.04 LTS, and 24.04 LTS."
                    log_warn "To bypass this check, re-run with: FORCE_INSTALL=true sudo bash install.sh"
                fi
                ;;
        esac
    elif [ "$os_id" = "debian" ]; then
        log_warn "Debian detected. Debian is binary-compatible with Docker Compose installations."
    else
        if [ "$FORCE_INSTALL" = "true" ]; then
            log_warn "Non-Ubuntu distribution detected (${os_id}). Proceeding due to FORCE_INSTALL=true."
        else
            log_error "SkyOps is officially distributed for Ubuntu Server. Found: ${os_id}."
            log_error "To force installation on other systemd/Docker systems, set FORCE_INSTALL=true."
            exit 1
        fi
    fi
}

check_system_resources() {
    # Check RAM
    local total_ram_mb=0
    if [ -f /proc/meminfo ]; then
        total_ram_mb=$(awk '/MemTotal/ { printf "%.0f", $2/1024 }' /proc/meminfo)
    elif command -v free >/dev/null 2>&1; then
        total_ram_mb=$(free -m | awk '/^Mem:/ { print $2 }')
    fi

    if [ "$total_ram_mb" -gt 0 ]; then
        if [ "$total_ram_mb" -lt 1800 ] && [ "$FORCE_INSTALL" != "true" ]; then
            log_error "Insufficient system RAM: ${total_ram_mb} MB available."
            log_error "SkyOps requires a minimum of 2 GB (2048 MB) RAM, with 4 GB recommended."
            exit 1
        elif [ "$total_ram_mb" -lt 3800 ]; then
            log_warn "Available RAM is ${total_ram_mb} MB. Minimum requirement met (2 GB), but 4 GB+ is recommended for busy production clusters."
        else
            log_success "Verified system memory: ${total_ram_mb} MB RAM (Requirement: 4 GB+)"
        fi
    fi

    # Check Disk Space in /opt
    local target_check_dir="/"
    [ -d "/opt" ] && target_check_dir="/opt"
    local free_disk_mb
    free_disk_mb=$(df -m "$target_check_dir" | awk 'NR==2 { print $4 }')

    if [ -n "$free_disk_mb" ]; then
        if [ "$free_disk_mb" -lt 5000 ] && [ "$FORCE_INSTALL" != "true" ]; then
            log_error "Insufficient free disk space in ${target_check_dir}: ${free_disk_mb} MB available."
            log_error "SkyOps requires at least 10 GB (10240 MB) free disk space."
            exit 1
        elif [ "$free_disk_mb" -lt 15000 ]; then
            log_warn "Free disk space in ${target_check_dir} is ${free_disk_mb} MB (10 GB minimum met, 20 GB recommended)."
        else
            log_success "Verified free disk space: ${free_disk_mb} MB available"
        fi
    fi
}

check_ports() {
    log_info "Verifying port ${DEFAULT_PORT} availability..."
    local port_in_use=false

    if command -v ss >/dev/null 2>&1; then
        if ss -tuln | grep -q ":${DEFAULT_PORT} "; then
            port_in_use=true
        fi
    elif command -v netstat >/dev/null 2>&1; then
        if netstat -tuln | grep -q ":${DEFAULT_PORT} "; then
            port_in_use=true
        fi
    elif command -v lsof >/dev/null 2>&1; then
        if lsof -i ":${DEFAULT_PORT}" >/dev/null 2>&1; then
            port_in_use=true
        fi
    fi

    if [ "$port_in_use" = "true" ]; then
        log_error "Port ${DEFAULT_PORT} is already in use by another service on this host."
        echo -e "You can configure a different external port before running by exporting SKYOPS_PORT:"
        echo -e "  ${BOLD}export SKYOPS_PORT=8080 && sudo -E bash install.sh${NC}"
        exit 1
    fi
    log_success "Port ${DEFAULT_PORT} is free and ready"
}

check_internet() {
    log_info "Verifying outbound internet access..."
    if command -v curl >/dev/null 2>&1; then
        if curl -fsSL --connect-timeout 5 https://registry-1.docker.io/v2/ >/dev/null 2>&1 || \
           curl -fsSL --connect-timeout 5 https://google.com >/dev/null 2>&1; then
            log_success "Outbound internet connectivity verified"
            return 0
        fi
    fi
    log_warn "Could not verify instant connection to external endpoints. Installation will proceed if local packages exist."
}

# ------------------------------------------------------------------------------
# 2. Docker Engine & Docker Compose Installation
# ------------------------------------------------------------------------------
ensure_docker() {
    local docker_installed=false
    local compose_installed=false

    if command -v docker >/dev/null 2>&1; then
        docker_installed=true
    fi

    if docker compose version >/dev/null 2>&1; then
        compose_installed=true
    fi

    if [ "$docker_installed" = "true" ] && [ "$compose_installed" = "true" ]; then
        log_success "Found Docker Engine: $(docker --version)"
        log_success "Found Docker Compose: $(docker compose version --short 2>/dev/null || docker compose version)"
        return 0
    fi

    log_info "Docker Engine or Docker Compose v2 is missing. Commencing automated installation..."

    if ! command -v apt-get >/dev/null 2>&1; then
        log_error "Automated package installation requires apt-get. Please install Docker Engine manually:"
        log_error "https://docs.docker.com/engine/install/"
        exit 1
    fi

    log_info "Updating apt package index..."
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg lsb-release

    log_info "Configuring official Docker repository GPG key..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # Determine Ubuntu release codename
    local codename
    codename="$(lsb_release -cs 2>/dev/null || echo "jammy")"

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      ${codename} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    log_info "Installing Docker Engine, CLI, and Docker Compose plugin..."
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    log_info "Enabling and starting Docker service daemon..."
    systemctl enable --now docker

    if docker compose version >/dev/null 2>&1; then
        log_success "Docker Engine and Docker Compose v2 successfully installed"
    else
        log_error "Docker installation finished but 'docker compose' command failed. Please check system logs."
        exit 1
    fi
}

# ------------------------------------------------------------------------------
# 3. Create Filesystem Layout & Secrets
# ------------------------------------------------------------------------------
setup_directories() {
    log_info "Configuring installation directory structure at ${INSTALL_DIR}..."
    mkdir -p "${INSTALL_DIR}"
    mkdir -p "${INSTALL_DIR}/data/postgres"
    mkdir -p "${INSTALL_DIR}/data/storage"
    mkdir -p "${INSTALL_DIR}/backups"
    mkdir -p "${INSTALL_DIR}/logs"
    mkdir -p "${INSTALL_DIR}/bin"
    mkdir -p "${INSTALL_DIR}/scripts"

    chmod 750 "${INSTALL_DIR}"
    chmod 700 "${INSTALL_DIR}/backups"
    log_success "Installation directories initialized"
}

copy_or_fetch_distribution_files() {
    local source_dir
    source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    log_info "Deploying SkyOps service configuration..."

    # If running from local clone or unpacked release tarball
    if [ -f "${source_dir}/docker-compose.yml" ]; then
        cp -f "${source_dir}/docker-compose.yml" "${INSTALL_DIR}/docker-compose.yml"
        [ -f "${source_dir}/Dockerfile" ] && cp -f "${source_dir}/Dockerfile" "${INSTALL_DIR}/Dockerfile"
        [ -f "${source_dir}/.dockerignore" ] && cp -f "${source_dir}/.dockerignore" "${INSTALL_DIR}/.dockerignore"
        [ -f "${source_dir}/package.json" ] && cp -f "${source_dir}/package.json" "${INSTALL_DIR}/package.json"
        [ -f "${source_dir}/package-lock.json" ] && cp -f "${source_dir}/package-lock.json" "${INSTALL_DIR}/package-lock.json"

        # Copy management tools and scripts
        [ -f "${source_dir}/bin/skyops" ] && cp -f "${source_dir}/bin/skyops" "${INSTALL_DIR}/bin/skyops"
        [ -f "${source_dir}/scripts/backup.sh" ] && cp -f "${source_dir}/scripts/backup.sh" "${INSTALL_DIR}/scripts/backup.sh"
        [ -f "${source_dir}/scripts/restore.sh" ] && cp -f "${source_dir}/scripts/restore.sh" "${INSTALL_DIR}/scripts/restore.sh"

        # Copy migrations if present
        if [ -d "${source_dir}/server/persistence/migrations" ]; then
            mkdir -p "${INSTALL_DIR}/server/persistence/migrations"
            cp -rf "${source_dir}/server/persistence/migrations/"* "${INSTALL_DIR}/server/persistence/migrations/"
        fi
        if [ -d "${source_dir}/dist" ]; then
            mkdir -p "${INSTALL_DIR}/dist"
            cp -rf "${source_dir}/dist/"* "${INSTALL_DIR}/dist/"
        fi
    else
        log_info "Fetching SkyOps release bundle (${RELEASE_VERSION})..."
        # Fallback to remote release download when distributed as standalone curl script
        curl -fsSL "https://github.com/skyops-software-solutions/skyops/releases/download/${RELEASE_VERSION}/skyops-self-hosted.tar.gz" -o /tmp/skyops.tar.gz || {
            log_error "Could not download official release tarball. Ensure ${RELEASE_VERSION} exists."
            exit 1
        }
        tar -xzf /tmp/skyops.tar.gz -C "${INSTALL_DIR}"
        rm -f /tmp/skyops.tar.gz
    fi

    chmod +x "${INSTALL_DIR}/bin/skyops" 2>/dev/null || true
    chmod +x "${INSTALL_DIR}/scripts/backup.sh" 2>/dev/null || true
    chmod +x "${INSTALL_DIR}/scripts/restore.sh" 2>/dev/null || true

    # Install CLI to /usr/local/bin for system-wide access
    if [ -f "${INSTALL_DIR}/bin/skyops" ]; then
        cp -f "${INSTALL_DIR}/bin/skyops" /usr/local/bin/skyops
        chmod 755 /usr/local/bin/skyops
        log_success "Installed SkyOps CLI tool: /usr/local/bin/skyops"
    fi
}

generate_secrets_and_env() {
    local env_file="${INSTALL_DIR}/.env"

    if [ -f "$env_file" ]; then
        log_info "Existing environment configuration detected at ${env_file}. Preserving secrets."
        chmod 600 "$env_file"
        return 0
    fi

    log_info "Generating cryptographically secure secrets for self-hosted deployment..."

    local jwt_secret=""
    local db_password=""

    if command -v openssl >/dev/null 2>&1; then
        jwt_secret="$(openssl rand -hex 32)"
        db_password="$(openssl rand -hex 24)"
    else
        jwt_secret="$(head -c 32 /dev/urandom | xxd -p | head -n 1)"
        db_password="$(head -c 24 /dev/urandom | xxd -p | head -n 1)"
    fi

    # Determine Host IP
    local server_ip
    server_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [ -z "$server_ip" ] && server_ip="127.0.0.1"

    cat > "$env_file" << EOF
# SkyOps Self-Hosted Configuration
# Generated on: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

NODE_ENV=production
SKYOPS_DEPLOYMENT_MODE=self_hosted
SKYOPS_VERSION=${RELEASE_VERSION}
SKYOPS_PORT=${DEFAULT_PORT}

# Public application URL for web browser access
SKYOPS_APP_URL=http://${server_ip}:${DEFAULT_PORT}

# Central ingestion URL for in-cluster Kubernetes agents
SKYOPS_SERVER_URL=http://${server_ip}:${DEFAULT_PORT}

# Authentication
AUTH_PROVIDER=local
SKYOPS_JWT_SECRET=${jwt_secret}
CORS_ALLOWED_ORIGINS=*

# PostgreSQL Relational Persistence
PERSISTENCE_PROVIDER=postgres
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=skyops
POSTGRES_USER=skyops
POSTGRES_PASSWORD=${db_password}
POSTGRES_POOL_MAX=25

# Persistent Local Filesystem Storage
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=/var/lib/skyops/data
EOF

    # Strict access permissions: read/write by root only
    chmod 600 "$env_file"
    log_success "Generated secure configuration: ${env_file} (chmod 600)"
}

# ------------------------------------------------------------------------------
# 4. Launch Stack & Verify Health
# ------------------------------------------------------------------------------
start_skyops() {
    log_info "Starting SkyOps Docker Compose services..."
    cd "${INSTALL_DIR}"
    docker compose up -d

    log_info "Waiting for PostgreSQL and SkyOps Control Plane to become healthy..."
    local attempts=0
    local max_attempts=30
    local is_ready=false

    while [ "$attempts" -lt "$max_attempts" ]; do
        attempts=$((attempts + 1))
        sleep 2

        if curl -fsSL "http://127.0.0.1:${DEFAULT_PORT}/api/v1/auth/status" >/dev/null 2>&1; then
            is_ready=true
            break
        fi
        echo -ne "."
    done
    echo ""

    if [ "$is_ready" != "true" ]; then
        log_error "Timed out waiting for SkyOps to pass health checks."
        echo -e "You can inspect the startup logs using: ${BOLD}docker compose -f ${INSTALL_DIR}/docker-compose.yml logs${NC}"
        exit 1
    fi

    log_success "SkyOps Control Plane is healthy and accepting connections!"
}

# ------------------------------------------------------------------------------
# 5. Summary Banner & Next Steps
# ------------------------------------------------------------------------------
print_summary() {
    local server_ip
    server_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [ -z "$server_ip" ] && server_ip="localhost"

    echo ""
    echo -e "${GREEN}======================================================================${NC}"
    echo -e "${GREEN}${BOLD}   ✓ SkyOps Self-Hosted Platform Successfully Installed!              ${NC}"
    echo -e "${GREEN}======================================================================${NC}"
    echo ""
    echo -e "  ${BOLD}Dashboard URL:${NC}       ${CYAN}http://${server_ip}:${DEFAULT_PORT}${NC}"
    echo -e "  ${BOLD}First-Run Setup:${NC}     ${CYAN}http://${server_ip}:${DEFAULT_PORT}/setup${NC}"
    echo -e "  ${BOLD}Install Directory:${NC}   ${INSTALL_DIR}"
    echo -e "  ${BOLD}Config / Secrets:${NC}    ${INSTALL_DIR}/.env (chmod 600)"
    echo -e "  ${BOLD}CLI Tool:${NC}            /usr/local/bin/skyops"
    echo ""
    echo -e "${YELLOW}Next Steps to Complete Installation:${NC}"
    echo -e "  1. Open your browser and navigate to: ${BOLD}http://${server_ip}:${DEFAULT_PORT}/setup${NC}"
    echo -e "  2. Create your initial Administrator account and organization workspace."
    echo -e "  3. Go to ${BOLD}Clusters -> Connect Cluster${NC} to obtain your cluster token."
    echo -e "  4. Deploy the SkyOps agent to your Kubernetes cluster using the provided Helm command:"
    echo -e "     ${CYAN}helm repo add skyops https://charts.skyops.io${NC}"
    echo -e "     ${CYAN}helm install skyops-agent skyops/skyops-agent --set serverUrl=http://${server_ip}:${DEFAULT_PORT} ...${NC}"
    echo ""
    echo -e "${BOLD}Platform Management Commands:${NC}"
    echo -e "  Check service status:   ${CYAN}skyops status${NC}"
    echo -e "  View application logs:  ${CYAN}skyops logs${NC}"
    echo -e "  Create full backup:     ${CYAN}skyops backup${NC}"
    echo -e "  Restart platform:       ${CYAN}skyops restart${NC}"
    echo ""
    echo -e "${BLUE}======================================================================${NC}"
}

# ------------------------------------------------------------------------------
# Main Entry Point
# ------------------------------------------------------------------------------
main() {
    banner
    check_root
    check_architecture
    check_os
    check_system_resources
    check_ports
    check_internet
    ensure_docker
    setup_directories
    copy_or_fetch_distribution_files
    generate_secrets_and_env
    start_skyops
    print_summary
}

# Only execute main if script is executed directly, allowing test sourcing
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
