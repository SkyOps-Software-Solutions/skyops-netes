import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { load as yamlLoad } from 'js-yaml';

describe('Phase 3: Docker Packaging, Compose & Installer Verification', () => {
  const rootDir = process.cwd();

  describe('1. Dockerfile & Container Hardening', () => {
    const dockerfilePath = path.join(rootDir, 'Dockerfile');

    it('Dockerfile exists and contains required multi-stage structure', () => {
      assert.ok(fs.existsSync(dockerfilePath), 'Dockerfile must exist in root');
      const content = fs.readFileSync(dockerfilePath, 'utf-8');

      // Multi-stage builder & runner
      assert.match(content, /FROM node:\d+-alpine AS builder/, 'Must contain builder stage');
      assert.match(content, /FROM node:\d+-alpine AS runner/, 'Must contain runner stage');
      assert.match(content, /npm run build/, 'Must execute npm run build in builder');
    });

    it('Enforces non-root unprivileged user execution', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf-8');
      assert.match(content, /addgroup -g 10001 -S skyops/, 'Must create dedicated unprivileged group');
      assert.match(content, /adduser -u 10001 -S skyops -G skyops/, 'Must create dedicated unprivileged user');
      assert.match(content, /USER skyops:skyops/, 'Must switch to unprivileged user');
    });

    it('Configures tini init system and native healthcheck', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf-8');
      assert.match(content, /tini/, 'Must install tini for signal forwarding');
      assert.match(content, /ENTRYPOINT \["\/sbin\/tini", "--"\]/, 'Must use tini as ENTRYPOINT');
      assert.match(content, /HEALTHCHECK/, 'Must declare native container HEALTHCHECK');
      assert.match(content, /\/api\/v1\/auth\/status/, 'Healthcheck must probe auth/status endpoint');
      assert.match(content, /EXPOSE 3000/, 'Must expose port 3000');
    });

    it('.dockerignore exists and excludes secrets and development artifacts', () => {
      const dockerignorePath = path.join(rootDir, '.dockerignore');
      assert.ok(fs.existsSync(dockerignorePath), '.dockerignore must exist');
      const content = fs.readFileSync(dockerignorePath, 'utf-8');

      assert.match(content, /\.git/, 'Must exclude .git');
      assert.match(content, /node_modules/, 'Must exclude node_modules');
      assert.match(content, /\.env/, 'Must exclude .env');
      assert.match(content, /coverage/, 'Must exclude coverage');
    });
  });

  describe('2. Docker Compose Specification', () => {
    const composePath = path.join(rootDir, 'docker-compose.yml');

    it('docker-compose.yml parses as valid YAML with required services', () => {
      assert.ok(fs.existsSync(composePath), 'docker-compose.yml must exist');
      const doc = yamlLoad(fs.readFileSync(composePath, 'utf-8')) as any;

      assert.ok(doc.services, 'Must define services');
      assert.ok(doc.services.postgres, 'Must define postgres service');
      assert.ok(doc.services.skyops, 'Must define skyops service');
      assert.ok(doc.volumes, 'Must define named volumes');
      assert.ok(doc.networks, 'Must define named networks');
    });

    it('PostgreSQL service is isolated and not exposed to the host', () => {
      const doc = yamlLoad(fs.readFileSync(composePath, 'utf-8')) as any;
      const pg = doc.services.postgres;

      assert.match(pg.image, /^postgres:16-alpine/, 'Must use postgres:16-alpine image');
      assert.ok(pg.healthcheck, 'PostgreSQL must have a healthcheck');
      assert.ok(!pg.ports, 'PostgreSQL MUST NOT expose ports to the host');
      assert.ok(pg.expose && pg.expose.includes('5432'), 'Port 5432 must be internally exposed only');
    });

    it('SkyOps service depends on healthy PostgreSQL and mounts persistent volume', () => {
      const doc = yamlLoad(fs.readFileSync(composePath, 'utf-8')) as any;
      const skyops = doc.services.skyops;

      assert.ok(skyops.depends_on.postgres, 'Must depend on postgres');
      assert.strictEqual(skyops.depends_on.postgres.condition, 'service_healthy', 'Must wait for healthy postgres');
      assert.ok(skyops.volumes.some((v: string) => v.includes('skyops_appdata')), 'Must mount persistent appdata volume');
      assert.ok(doc.volumes.skyops_pgdata, 'Must declare skyops_pgdata volume');
      assert.ok(doc.volumes.skyops_appdata, 'Must declare skyops_appdata volume');
    });

    it('.env.production.template defines all required configuration parameters', () => {
      const templatePath = path.join(rootDir, '.env.production.template');
      assert.ok(fs.existsSync(templatePath), '.env.production.template must exist');
      const content = fs.readFileSync(templatePath, 'utf-8');

      assert.match(content, /SKYOPS_DEPLOYMENT_MODE=self_hosted/);
      assert.match(content, /PERSISTENCE_PROVIDER=postgres/);
      assert.match(content, /AUTH_PROVIDER=local/);
      assert.match(content, /POSTGRES_PASSWORD=/);
      assert.match(content, /SKYOPS_JWT_SECRET=/);
      assert.match(content, /LOCAL_STORAGE_PATH=/);
    });
  });

  describe('3. One-Command Linux Installer (install.sh)', () => {
    const installPath = path.join(rootDir, 'install.sh');

    it('install.sh exists and is executable', () => {
      assert.ok(fs.existsSync(installPath), 'install.sh must exist');
      const stats = fs.statSync(installPath);
      assert.ok((stats.mode & fs.constants.S_IXUSR) !== 0, 'install.sh must be executable');
    });

    it('Bash syntax check passes on install.sh', () => {
      assert.doesNotThrow(() => {
        execSync(`bash -n "${installPath}"`, { stdio: 'pipe' });
      }, 'install.sh must pass bash -n syntax validation');
    });

    it('Implements all mandatory preflight checks', () => {
      const content = fs.readFileSync(installPath, 'utf-8');

      assert.match(content, /check_root/, 'Must verify root privileges');
      assert.match(content, /check_architecture/, 'Must verify x86_64 architecture');
      assert.match(content, /check_os/, 'Must verify Ubuntu OS release');
      assert.match(content, /check_system_resources/, 'Must verify RAM and disk space');
      assert.match(content, /check_ports/, 'Must verify port availability');
      assert.match(content, /check_internet/, 'Must verify internet connectivity');
      assert.match(content, /ensure_docker/, 'Must verify or install Docker Engine & Compose');
    });

    it('Generates cryptographic secrets and enforces chmod 600', () => {
      const content = fs.readFileSync(installPath, 'utf-8');

      assert.match(content, /openssl rand -hex 32/, 'Must generate 256-bit JWT secret');
      assert.match(content, /openssl rand -hex 24/, 'Must generate secure PostgreSQL password');
      assert.match(content, /chmod 600 "\$env_file"/, 'Must enforce chmod 600 on created .env file');
    });

    it('Installs CLI management tool to /usr/local/bin/skyops', () => {
      const content = fs.readFileSync(installPath, 'utf-8');
      assert.match(content, /\/usr\/local\/bin\/skyops/, 'Must link or copy CLI tool to /usr/local/bin');
    });
  });

  describe('4. Management CLI Tool (bin/skyops)', () => {
    const cliPath = path.join(rootDir, 'bin', 'skyops');

    it('bin/skyops exists and is executable', () => {
      assert.ok(fs.existsSync(cliPath), 'bin/skyops must exist');
      const stats = fs.statSync(cliPath);
      assert.ok((stats.mode & fs.constants.S_IXUSR) !== 0, 'bin/skyops must be executable');
    });

    it('Bash syntax check passes on bin/skyops', () => {
      assert.doesNotThrow(() => {
        execSync(`bash -n "${cliPath}"`, { stdio: 'pipe' });
      }, 'bin/skyops must pass bash -n syntax validation');
    });

    it('Supports all required management subcommands', () => {
      const content = fs.readFileSync(cliPath, 'utf-8');

      const requiredCommands = [
        'status',
        'start',
        'stop',
        'restart',
        'logs',
        'update',
        'backup',
        'restore',
        'version',
        'uninstall',
        'help'
      ];

      for (const cmd of requiredCommands) {
        assert.match(content, new RegExp(`cmd_${cmd}\\(\\)`, 'm'), `Must implement cmd_${cmd}`);
      }
    });

    it('Guards destructive uninstallation with explicit confirmation phrase', () => {
      const content = fs.readFileSync(cliPath, 'utf-8');
      assert.match(content, /DESTROY ALL DATA/, 'Must prompt for exact confirmation phrase "DESTROY ALL DATA"');
    });
  });

  describe('5. Backup & Disaster Recovery Scripts', () => {
    const backupPath = path.join(rootDir, 'scripts', 'backup.sh');
    const restorePath = path.join(rootDir, 'scripts', 'restore.sh');

    it('backup.sh and restore.sh exist and are executable', () => {
      assert.ok(fs.existsSync(backupPath), 'scripts/backup.sh must exist');
      assert.ok(fs.existsSync(restorePath), 'scripts/restore.sh must exist');

      assert.ok((fs.statSync(backupPath).mode & fs.constants.S_IXUSR) !== 0, 'backup.sh must be executable');
      assert.ok((fs.statSync(restorePath).mode & fs.constants.S_IXUSR) !== 0, 'restore.sh must be executable');
    });

    it('Bash syntax check passes on backup and restore scripts', () => {
      assert.doesNotThrow(() => {
        execSync(`bash -n "${backupPath}"`, { stdio: 'pipe' });
      }, 'backup.sh must pass syntax validation');

      assert.doesNotThrow(() => {
        execSync(`bash -n "${restorePath}"`, { stdio: 'pipe' });
      }, 'restore.sh must pass syntax validation');
    });

    it('backup.sh exports database via pg_dump and calculates SHA-256', () => {
      const content = fs.readFileSync(backupPath, 'utf-8');
      assert.match(content, /pg_dump.*-F c -b/, 'Must use native pg_dump custom compressed format');
      assert.match(content, /backup-manifest\.json/, 'Must create backup-manifest.json');
      assert.match(content, /sha256/, 'Must calculate SHA-256 checksum');
    });

    it('restore.sh validates SHA-256 checksum and requires confirmation', () => {
      const content = fs.readFileSync(restorePath, 'utf-8');
      assert.match(content, /sha256/, 'Must verify SHA-256 checksum');
      assert.match(content, /RESTORE/, 'Must require typed "RESTORE" confirmation');
      assert.match(content, /pg_restore/, 'Must restore database using pg_restore');
    });
  });

  describe('6. Operational Documentation Suite', () => {
    const docs = [
      'DOCKER_DEPLOYMENT.md',
      'UBUNTU_INSTALLATION.md',
      'INSTALLER_REFERENCE.md',
      'BACKUP_RESTORE.md',
      'NETWORK_SECURITY.md',
      'RELEASE_DISTRIBUTION.md'
    ];

    for (const doc of docs) {
      it(`Documentation file ${doc} exists and is well-formed`, () => {
        const fullPath = path.join(rootDir, doc);
        assert.ok(fs.existsSync(fullPath), `${doc} must exist`);
        const stats = fs.statSync(fullPath);
        assert.ok(stats.size > 200, `${doc} must not be empty or stubbed`);
      });
    }
  });
});
