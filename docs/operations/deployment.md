# Production Deployment & Operations

This guide details how to deploy, configure, secure, and operate the **SkyOps Control Plane** in production environments.

---

## Production Architecture & Requirements

In production, the SkyOps Control Plane runs as a stateless Node.js container backed by a persistent storage volume (`SKYOPS_DATA_DIR`) and sits behind a secure TLS reverse proxy (Nginx, Cloudflare, AWS ALB, or Kubernetes Ingress).

```mermaid
graph TD
    subgraph Ingress["TLS Termination & Ingress"]
        Traffic["Internet / Agent Traffic"] --> ReverseProxy["Nginx / ALB / Cloudflare<br/>TLS 1.3 Termination (Port 443)"]
    end

    subgraph AppServer["SkyOps Control Plane (Port 3000)"]
        ReverseProxy -->|Proxy Pass http://127.0.0.1:3000| Express["Node.js / Express Server<br/>server.ts (dist/server.cjs)"]
    end

    subgraph Storage["Persistent Storage"]
        Express -->|Atomic Flush| Volume["Persistent Storage Volume<br/>(AWS EBS, GCP PD, HostPath /var/lib/skyops)"]
    end

    subgraph CloudServices["External Managed APIs"]
        Express -->|AI RCA Requests| GeminiAPI["Google GenAI API (Gemini)"]
        Express -->|Alert Emails| SMTP["SMTP Gateway (SendGrid / SES)"]
    end
```

---

## Environment Configuration

Create a production `.env` file or inject environment variables via your secrets manager:

```env
# Runtime Environment
NODE_ENV=production
PORT=3000

# Persistent Data Storage (MANDATORY IN PRODUCTION)
# Server refuses to boot if this directory is not mounted and writeable.
SKYOPS_DATA_DIR=/var/lib/skyops

# Authentication & Security
SKYOPS_ALLOW_DEMO_AUTH=false

# Google Gemini AI Integration (Required for AI Root Cause Analysis)
GEMINI_API_KEY=AIzaSy...your-gemini-api-key...
GEMINI_MODEL=gemini-3.1-flash-lite

# Email Alerting Gateway (SMTP)
SKYOPS_SMTP_HOST=smtp.sendgrid.net
SKYOPS_SMTP_PORT=587
SKYOPS_SMTP_SECURE=false
SKYOPS_SMTP_USER=apikey
SKYOPS_SMTP_PASS=SG.your-sendgrid-secret-key
SKYOPS_NOTIFICATION_SENDER_EMAIL=alerts@skyops.yourcompany.com
SKYOPS_NOTIFICATION_SENDER_NAME=SkyOps Production Alerting
```

---

## Option 1: Docker Deployment

### 1. Dockerfile
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server

RUN mkdir -p /var/lib/skyops && chown -R node:node /var/lib/skyops
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
```

### 2. Docker Compose
```yaml
version: '3.8'

services:
  skyops:
    image: skyops-control-plane:v1.5.0
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - SKYOPS_DATA_DIR=/var/lib/skyops
      - SKYOPS_ALLOW_DEMO_AUTH=false
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - SKYOPS_SMTP_HOST=${SKYOPS_SMTP_HOST}
      - SKYOPS_SMTP_PORT=587
      - SKYOPS_SMTP_USER=${SKYOPS_SMTP_USER}
      - SKYOPS_SMTP_PASS=${SKYOPS_SMTP_PASS}
    volumes:
      - skyops-storage:/var/lib/skyops

volumes:
  skyops-storage:
    driver: local
```

---

## Option 2: Kubernetes Deployment Manifest

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: skyops-platform
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: skyops-data-pvc
  namespace: skyops-platform
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: skyops-server
  namespace: skyops-platform
spec:
  replicas: 1
  strategy:
    type: Recreate # Required for ReadWriteOnce storage volume
  selector:
    matchLabels:
      app: skyops-server
  template:
    metadata:
      labels:
        app: skyops-server
    spec:
      containers:
        - name: server
          image: ghcr.io/skyops-io/skyops-server:v1.5.0
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: SKYOPS_DATA_DIR
              value: "/var/lib/skyops"
            - name: SKYOPS_ALLOW_DEMO_AUTH
              value: "false"
            - name: GEMINI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: skyops-secrets
                  key: gemini-api-key
          volumeMounts:
            - name: data-volume
              mountPath: /var/lib/skyops
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: data-volume
          persistentVolumeClaim:
            claimName: skyops-data-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: skyops-service
  namespace: skyops-platform
spec:
  selector:
    app: skyops-server
  ports:
    - port: 80
      targetPort: 3000
```

---

## Nginx Reverse Proxy Configuration

When hosting behind Nginx, configure proper reverse proxy buffering and timeout settings:

```nginx
server {
    listen 443 ssl http2;
    server_name skyops.yourcompany.com;

    ssl_certificate /etc/letsencrypt/live/skyops.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/skyops.yourcompany.com/privkey.pem;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Allow long-polling and log streaming without premature timeout
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

---

## Backup & Disaster Recovery

All state in SkyOps is persisted cleanly in `SKYOPS_DATA_DIR`. To implement automated daily backups:

```bash
#!/bin/bash
BACKUP_DIR="/mnt/backups/skyops"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "${BACKUP_DIR}"

# Archive JSON state files atomically
tar -czf "${BACKUP_DIR}/skyops_backup_${DATE}.tar.gz" -C /var/lib/skyops .

# Retain last 30 daily backups
find "${BACKUP_DIR}" -name "skyops_backup_*.tar.gz" -mtime +30 -delete
```

To restore from backup on a fresh instance:
```bash
tar -xzf skyops_backup_20260917_080000.tar.gz -C /var/lib/skyops
```
Restart the SkyOps server. The `DataStore` will read the restored state at boot.

---

## Option 3: Google Cloud Run (FinOps & Scale-to-Zero Architecture)

To minimize idle cloud spending during early customer acquisition, SkyOps Control Plane is certified for Google Cloud Run with **Scale-to-Zero (`min-instances = 0`)** and **Request-Based Billing (`cpu-throttling = true`)**.

### 1. Architectural Fit for Scale-to-Zero
- **Stateless Compute**: Persistent data is housed in Google Cloud Firestore (`ai-studio-skyopsnetes-4a761b81-84c9-4610-bae6-624468cf7a67`) and Cloud Storage.
- **Fast Cold Start**: Pre-bundled production runtime (`dist/server.cjs`) initializes and binds TCP port 3000 in under 1 second.
- **Zero Cost When Idle**: With `min-instances = 0`, Cloud Run shuts down all container instances when no requests or agent telemetry arrive, reducing compute costs to $0 during quiet periods.

### 2. Declarative Deployment via Knative Service Manifest
Apply the cost-optimized manifest located at `deploy/cloudrun/service.yaml`:

```bash
gcloud run services replace deploy/cloudrun/service.yaml \
  --project="skyops-a1143" \
  --region="asia-southeast1"
```

### 3. Imperative Deployment Command (Enforcing Min-Instances = 0)
When deploying via the `gcloud` CLI or CI/CD pipelines, always pass these flags to prevent accidental reversion to always-on billing:

```bash
gcloud run deploy skyops-server \
  --image="gcr.io/skyops-a1143/skyops-server:v1.5.1" \
  --project="skyops-a1143" \
  --region="asia-southeast1" \
  --platform="managed" \
  --allow-unauthenticated \
  --port=3000 \
  --min-instances=0 \
  --max-instances=5 \
  --concurrency=80 \
  --cpu=1 \
  --memory=1Gi \
  --no-cpu-throttling=false \
  --cpu-boost \
  --set-env-vars="NODE_ENV=production,PERSISTENCE_PROVIDER=firestore,FIREBASE_PROJECT_ID=skyops-a1143,SKYOPS_DATA_DIR=/tmp/skyops-cache" \
  --update-labels="app=skyops,tier=control-plane,finops-policy=scale-to-zero"
```

### 4. Automated FinOps Optimization Script
Execute the repository optimizer to audit, enforce scale-to-zero, clean up tagged revisions, and check health:

```bash
# Preview changes safely without executing
./scripts/cloudrun-cost-optimizer.sh --project=skyops-a1143 --region=asia-southeast1 --dry-run

# Apply scale-to-zero and request-based billing
./scripts/cloudrun-cost-optimizer.sh --project=skyops-a1143 --region=asia-southeast1

# Rollback if needed (sets min-instances=1 for emergency warm capacity)
./scripts/cloudrun-cost-optimizer.sh --project=skyops-a1143 --region=asia-southeast1 --rollback
```

### 5. Google Cloud Budget Alerts Configuration
Set proactive budget alerts at 50%, 80%, and 100% of your target threshold ($50/month default):

```bash
gcloud billing budgets create \
  --billing-account="YOUR_BILLING_ACCOUNT_ID" \
  --display-name="SkyOps Early-Acquisition Budget" \
  --budget-amount=50USD \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.8 \
  --threshold-rule=percent=1.0 \
  --threshold-rule=percent=1.0,basis=forecasted-spend \
  --filter-projects="projects/skyops-a1143"
```
*(Note: Budget alerts notify engineering teams via email or Slack; they do not automatically terminate live production infrastructure.)*

