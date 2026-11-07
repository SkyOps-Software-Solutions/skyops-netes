# ==============================================================================
# SkyOps Control Plane - Production Multi-Stage Container Image
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Application and Frontend Bundles
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install standard build prerequisites
RUN apk add --no-cache python3 make g++

# Copy package manifests first to leverage Docker layer caching
COPY package*.json ./

# Install all dependencies for compilation
RUN npm ci

# Copy application source files
COPY . .

# Build Vite frontend and bundled Node.js server with migrations
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Minimal Runtime Environment
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

LABEL maintainer="SkyOps Platform Team <security@skyops.io>"
LABEL org.opencontainers.image.title="SkyOps Control Plane"
LABEL org.opencontainers.image.description="Self-Hosted Kubernetes Incident Management & Telemetry Control Plane"
LABEL org.opencontainers.image.vendor="SkyOps"

# Install tini for reliable PID 1 signal forwarding and curl for container healthchecks
RUN apk add --no-cache curl tini bash

# Create an unprivileged system user and group (UID/GID 10001)
RUN addgroup -g 10001 -S skyops && \
    adduser -u 10001 -S skyops -G skyops

WORKDIR /app

# Copy package manifests and install runtime production-only dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy pre-built frontend distribution, compiled server, and database migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/persistence/migrations ./server/persistence/migrations

# Create persistent storage directories and assign ownership to unprivileged user
RUN mkdir -p /var/lib/skyops/data && \
    chown -R skyops:skyops /app /var/lib/skyops

# Run as unprivileged user
USER skyops:skyops

# Production Environment Variables
ENV NODE_ENV=production \
    PORT=3000 \
    SKYOPS_DEPLOYMENT_MODE=self_hosted \
    PERSISTENCE_PROVIDER=postgres \
    AUTH_PROVIDER=local \
    STORAGE_DRIVER=local \
    LOCAL_STORAGE_PATH=/var/lib/skyops/data \
    MIGRATIONS_DIR=/app/dist/migrations

# Expose internal web & API port
EXPOSE 3000

# Container healthcheck monitoring authentication status endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://127.0.0.1:3000/api/v1/auth/status || exit 1

# Launch with tini init system to handle SIGTERM/SIGINT gracefully
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.cjs"]
