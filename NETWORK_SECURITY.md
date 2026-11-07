# SkyOps Network Architecture & Security Hardening

This document outlines the network boundaries, ports, firewall rules, and reverse proxy guidelines for a production self-hosted SkyOps installation.

---

## 1. Network Topology & Port Mapping

```
                                      Internet / Corporate LAN
                                                 │
                             ┌───────────────────┴───────────────────┐
                             │                                       │
                      Browser Traffic                        Agent Telemetry
                      (HTTPS :443)                           (HTTPS :443)
                             │                                       │
                             ▼                                       ▼
                  ┌─────────────────────────────────────────────────────────────┐
                  │ Host Ingress / Reverse Proxy (e.g., Caddy, NGINX, Cloudflare)│
                  │ - SSL/TLS Termination (Let's Encrypt / Corp CA)             │
                  │ - Security Headers (HSTS, CSP, X-Frame-Options)             │
                  └──────────────────────────────┬──────────────────────────────┘
                                                 │
                                 HTTP :3000 (Local Loopback or LAN)
                                                 │
                                                 ▼
                  ┌─────────────────────────────────────────────────────────────┐
                  │ skyops-control-plane Container (:3000)                      │
                  └──────────────────────────────┬──────────────────────────────┘
                                                 │
                                  Internal TCP :5432 (Bridge Network)
                                  [NEVER published to host]
                                                 │
                                                 ▼
                  ┌─────────────────────────────────────────────────────────────┐
                  │ skyops-postgres Container (:5432)                           │
                  └─────────────────────────────────────────────────────────────┘
```

### Port Allocation Summary

| Port | Protocol | Scope | Direction | Purpose |
| :---: | :---: | :---: | :---: | :--- |
| `3000` | TCP | Host / Reverse Proxy | Inbound | SkyOps web dashboard & API ingress. |
| `5432` | TCP | **Internal Docker Network Only** | Internal | PostgreSQL communication. Never bind to `0.0.0.0` or host interfaces. |
| `80` | TCP | Public Host | Inbound | HTTP redirect to HTTPS (managed by reverse proxy). |
| `443` | TCP | Public Host | Inbound | Secure TLS termination (managed by reverse proxy). |

---

## 2. Host Firewall Configuration (UFW)

On Ubuntu Server, use `ufw` to restrict inbound connections:

```bash
# Set baseline policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH management (adjust if using custom port)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS for web traffic
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# If accessing SkyOps directly on port 3000 without reverse proxy:
sudo ufw allow 3000/tcp

# Enable firewall
sudo ufw enable
```

**PostgreSQL Safety Note**: Because `docker-compose.yml` does not publish port `5432` to the host (it uses `expose: - "5432"` inside `skyops-network`), PostgreSQL is completely inaccessible from external networks even if Docker alters iptables rules.

---

## 3. Recommended Reverse Proxy Configurations

### Option A: Caddy (Recommended for automatic HTTPS)

Caddy automatically acquires and renews Let's Encrypt SSL certificates:

```caddyfile
# /etc/caddy/Caddyfile
skyops.yourcompany.com {
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
        header_up X-Real-IP {remote_host}
    }

    # Recommended Security Headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

### Option B: NGINX

```nginx
# /etc/nginx/sites-available/skyops
server {
    listen 80;
    server_name skyops.yourcompany.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name skyops.yourcompany.com;

    ssl_certificate /etc/letsencrypt/live/skyops.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/skyops.yourcompany.com/privkey.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 4. Container Security Hardening

The SkyOps production Docker deployment enforces the following security controls:
1. **Unprivileged Runtime**: Containers execute as unprivileged user `skyops` (UID `10001`), preventing container breakout vulnerabilities.
2. **No New Privileges**: `security_opt: [ "no-new-privileges:true" ]` prevents processes from gaining additional privileges via setuid binaries.
3. **Internal Database Isolation**: PostgreSQL is accessible exclusively via the internal Docker bridge network `skyops-network`.
4. **Encrypted Secrets at Rest**: Passwords and JWT secrets are stored in `.env` with strict permissions `0600` owned by root.
5. **Secure Cookie Transmission**: In production behind HTTPS, session cookies include `HttpOnly`, `SameSite=Lax`, and `Secure` attributes.
