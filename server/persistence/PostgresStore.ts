import { Pool, PoolConfig } from 'pg';
import {
  Cluster,
  Incident,
  IncidentNote,
  KubernetesResource,
  Organization,
  OrgInvitation,
  OrgMember,
  Role,
  RemediationAction,
  RemediationPolicy,
  SkyOpsAIAnalysis,
  StructuredRemediation,
  SupportTicket,
  TimelineEvent,
  User,
  UserNotificationSettings,
  Subscription,
  Invoice,
  MetricHistoryPoint,
  StoredArtifact,
  StoredArtifactFilters,
  StoredArtifactLifecycleStatus,
  StorageUsageSummary
} from '../../src/types/index';
import { LogQueryFilter, LogRecord } from '../../src/types/logs';
import {
  AuditEvent,
  AuditQueryFilters,
  PaginatedResult,
  WebhookConfig,
  WebhookDeliveryRecord,
  OrgUsageSummary
} from '../repositories/types';
import { ClusterResourcesRecord, ClusterTokenRecord, IPersistenceStore } from './types';
import { PostgresMigrator } from './migrator';

export interface PostgresStoreConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: any;
}

export class PostgresStore implements IPersistenceStore {
  public readonly providerName = 'postgres';
  private pool: Pool;
  private migrator: PostgresMigrator;
  private isInitialized = false;

  constructor(config?: PostgresStoreConfig | Pool) {
    if (config && 'connect' in config && typeof (config as any).connect === 'function') {
      this.pool = config as Pool;
    } else {
      const cfg = config as PostgresStoreConfig | undefined;
      const connectionString =
        cfg?.connectionString ||
        process.env.DATABASE_URL ||
        process.env.SKYOPS_POSTGRES_URL ||
        process.env.POSTGRES_URL;

      const poolConfig: PoolConfig = connectionString
        ? { connectionString }
        : {
            host: cfg?.host || process.env.POSTGRES_HOST || 'localhost',
            port: cfg?.port || parseInt(process.env.POSTGRES_PORT || '5432', 10),
            user: cfg?.user || process.env.POSTGRES_USER || 'skyops',
            password: cfg?.password || process.env.POSTGRES_PASSWORD || 'skyops',
            database: cfg?.database || process.env.POSTGRES_DB || 'skyops',
            max: cfg?.max || parseInt(process.env.POSTGRES_POOL_MAX || '20', 10),
            idleTimeoutMillis: cfg?.idleTimeoutMillis || 30000,
            connectionTimeoutMillis: cfg?.connectionTimeoutMillis || 5000,
            ssl: cfg?.ssl || (process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined)
          };

      this.pool = new Pool(poolConfig);
    }

    this.migrator = new PostgresMigrator(this.pool);

    this.pool.on('error', (err) => {
      console.error('[PostgresStore] Unexpected idle client error on PostgreSQL pool:', err);
    });
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    try {
      const res = await this.pool.query('SELECT 1 as live');
      if (res.rows[0]?.live === 1) {
        console.log('[PostgresStore] Connected to PostgreSQL successfully.');
      }
      await this.migrator.runPendingMigrations();
      this.isInitialized = true;
    } catch (err: any) {
      console.error('[PostgresStore] Fatal error initializing PostgreSQL connection or running migrations:', err?.message || err);
      throw err;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
    this.isInitialized = false;
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const res = await this.pool.query('SELECT 1 as healthy');
      return res.rows[0]?.healthy === 1;
    } catch {
      return false;
    }
  }

  // --- Local Credentials & Self-Hosted Auth ---
  public async getLocalCredential(
    userId: string
  ): Promise<{ userId: string; passwordHash: string; passwordAlgo: string; mustChangePassword?: boolean } | null> {
    const res = await this.pool.query(
      'SELECT user_id, password_hash, password_algo, must_change_password FROM local_credentials WHERE user_id = $1',
      [userId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      userId: row.user_id,
      passwordHash: row.password_hash,
      passwordAlgo: row.password_algo,
      mustChangePassword: row.must_change_password
    };
  }

  public async saveLocalCredential(userId: string, passwordHash: string, passwordAlgo = 'bcrypt'): Promise<void> {
    await this.pool.query(
      `INSERT INTO local_credentials (user_id, password_hash, password_algo, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           password_algo = EXCLUDED.password_algo,
           updated_at = NOW()`,
      [userId, passwordHash, passwordAlgo]
    );
  }

  public async countUsers(): Promise<number> {
    const res = await this.pool.query('SELECT COUNT(*) as count FROM users');
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  public async countAdmins(): Promise<number> {
    const res = await this.pool.query(
      "SELECT COUNT(DISTINCT user_id) as count FROM org_members WHERE role IN ('OWNER', 'ADMIN')"
    );
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  // --- Users ---
  public async getUser(userId: string): Promise<User | null> {
    const res = await this.pool.query(
      'SELECT id, email, name, email_verified, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      email: r.email,
      name: r.name
    };
  }

  public async upsertUser(user: User): Promise<User> {
    const email = user.email.toLowerCase().trim();
    const name = user.name || email.split('@')[0];
    const res = await this.pool.query(
      `INSERT INTO users (id, email, name, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           name = EXCLUDED.name,
           updated_at = NOW()
       RETURNING id, email, name, created_at`,
      [user.id, email, name]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      email: r.email,
      name: r.name
    };
  }

  public async listUsers(): Promise<User[]> {
    const res = await this.pool.query('SELECT id, email, name, created_at FROM users ORDER BY created_at ASC');
    return res.rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name
    }));
  }

  // --- User Notification Settings ---
  public async getUserNotificationSettings(userId: string): Promise<UserNotificationSettings | null> {
    const res = await this.pool.query('SELECT settings FROM user_notification_settings WHERE user_id = $1', [userId]);
    if (res.rows.length === 0) return null;
    return res.rows[0].settings as UserNotificationSettings;
  }

  public async saveUserNotificationSettings(userId: string, settings: UserNotificationSettings): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_notification_settings (user_id, settings, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET settings = EXCLUDED.settings, updated_at = NOW()`,
      [userId, JSON.stringify(settings)]
    );
  }

  // --- Organizations ---
  public async getOrganization(orgId: string): Promise<Organization | null> {
    const res = await this.pool.query('SELECT id, name, slug, owner_user_id, settings, created_at FROM organizations WHERE id = $1', [orgId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerUserId: r.owner_user_id,
      membersCount: 1,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      settings: r.settings || {}
    };
  }

  public async upsertOrganization(org: Organization): Promise<Organization> {
    const slug = org.slug || org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `org-${Date.now()}`;
    const res = await this.pool.query(
      `INSERT INTO organizations (id, name, slug, owner_user_id, settings, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           owner_user_id = COALESCE(EXCLUDED.owner_user_id, organizations.owner_user_id),
           settings = EXCLUDED.settings,
           updated_at = NOW()
       RETURNING id, name, slug, owner_user_id, settings, created_at`,
      [org.id, org.name, slug, org.ownerUserId || null, JSON.stringify(org.settings || {})]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerUserId: r.owner_user_id,
      membersCount: org.membersCount || 1,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      settings: r.settings || {}
    };
  }

  public async listOrganizations(): Promise<Organization[]> {
    const res = await this.pool.query('SELECT id, name, slug, owner_user_id, settings, created_at FROM organizations ORDER BY created_at ASC');
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerUserId: r.owner_user_id,
      membersCount: 1,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      settings: r.settings || {}
    }));
  }

  public async deleteOrganization(orgId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Organization Memberships ---
  public async getOrgMembers(orgId: string): Promise<OrgMember[]> {
    const res = await this.pool.query('SELECT id, org_id, user_id, email, role, status, joined_at FROM org_members WHERE org_id = $1 ORDER BY joined_at ASC', [orgId]);
    return res.rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      userId: r.user_id,
      email: r.email,
      name: (r.email || 'user').split('@')[0],
      role: r.role as Role,
      status: r.status as any,
      joinedAt: r.joined_at ? new Date(r.joined_at).getTime() : Date.now()
    }));
  }

  public async setOrgMembers(orgId: string, members: OrgMember[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM org_members WHERE org_id = $1', [orgId]);
      for (const m of members) {
        await client.query(
          `INSERT INTO org_members (id, org_id, user_id, email, role, status, joined_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            m.id || `mem-${m.userId}-${orgId}`,
            orgId,
            m.userId,
            m.email.toLowerCase(),
            m.role,
            m.status || 'ACTIVE',
            m.joinedAt ? new Date(m.joinedAt) : new Date()
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async addOrgMember(orgId: string, member: OrgMember): Promise<OrgMember> {
    const id = member.id || `mem-${member.userId}-${orgId}`;
    await this.pool.query(
      `INSERT INTO org_members (id, org_id, user_id, email, role, status, joined_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (org_id, user_id) DO UPDATE
       SET role = EXCLUDED.role,
           status = EXCLUDED.status,
           email = EXCLUDED.email,
           updated_at = NOW()`,
      [
        id,
        orgId,
        member.userId,
        member.email.toLowerCase(),
        member.role,
        member.status || 'ACTIVE',
        member.joinedAt ? new Date(member.joinedAt) : new Date()
      ]
    );
    return member;
  }

  public async removeOrgMember(orgId: string, userId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM org_members WHERE org_id = $1 AND user_id = $2', [orgId, userId]);
    return (res.rowCount ?? 0) > 0;
  }

  public async getUserOrganizations(userId: string, email?: string): Promise<Organization[]> {
    const res = await this.pool.query(
      `SELECT o.id, o.name, o.slug, o.owner_user_id, o.settings, o.created_at
       FROM organizations o
       LEFT JOIN org_members m ON o.id = m.org_id
       WHERE m.user_id = $1
          OR ($2::varchar IS NOT NULL AND LOWER(m.email) = LOWER($2))
          OR o.owner_user_id = $1
       GROUP BY o.id, o.name, o.slug, o.owner_user_id, o.settings, o.created_at
       ORDER BY o.created_at ASC`,
      [userId, email || null]
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerUserId: r.owner_user_id,
      membersCount: 1,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      settings: r.settings || {}
    }));
  }

  // --- Invitations ---
  public async getInvitation(invitationId: string): Promise<OrgInvitation | null> {
    const res = await this.pool.query('SELECT id, org_id, email, role, token, inviter_user_id, status, expires_at, created_at FROM org_invitations WHERE id = $1', [invitationId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      orgId: r.org_id,
      email: r.email,
      role: r.role,
      token: r.token,
      invitedByUserId: r.inviter_user_id || 'system',
      invitedByEmail: 'admin@skyops.internal',
      status: r.status,
      expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : Date.now() + 86400000,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
    };
  }

  public async getInvitationByToken(token: string): Promise<OrgInvitation | null> {
    const res = await this.pool.query('SELECT id, org_id, email, role, token, inviter_user_id, status, expires_at, created_at FROM org_invitations WHERE token = $1', [token]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      orgId: r.org_id,
      email: r.email,
      role: r.role,
      token: r.token,
      invitedByUserId: r.inviter_user_id || 'system',
      invitedByEmail: 'admin@skyops.internal',
      status: r.status,
      expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : Date.now() + 86400000,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
    };
  }

  public async listOrgInvitations(orgId: string): Promise<OrgInvitation[]> {
    const res = await this.pool.query('SELECT id, org_id, email, role, token, inviter_user_id, status, expires_at, created_at FROM org_invitations WHERE org_id = $1 ORDER BY created_at DESC', [orgId]);
    return res.rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      email: r.email,
      role: r.role,
      token: r.token,
      invitedByUserId: r.inviter_user_id || 'system',
      invitedByEmail: 'admin@skyops.internal',
      status: r.status,
      expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : Date.now() + 86400000,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
    }));
  }

  public async saveInvitation(invitation: OrgInvitation): Promise<OrgInvitation> {
    await this.pool.query(
      `INSERT INTO org_invitations (id, org_id, email, role, token, inviter_user_id, status, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status,
           role = EXCLUDED.role,
           expires_at = EXCLUDED.expires_at`,
      [
        invitation.id,
        invitation.orgId,
        invitation.email.toLowerCase(),
        invitation.role,
        invitation.token,
        invitation.invitedByUserId || (invitation as any).inviterUserId || null,
        invitation.status || 'PENDING',
        new Date(invitation.expiresAt || Date.now() + 86400000),
        new Date(invitation.createdAt || Date.now())
      ]
    );
    return invitation;
  }

  public async deleteInvitation(invitationId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM org_invitations WHERE id = $1', [invitationId]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Support Tickets ---
  public async getSupportTicket(ticketId: string): Promise<SupportTicket | null> {
    const res = await this.pool.query('SELECT id, org_id, user_id, subject, status, priority, category, messages, created_at, updated_at FROM support_tickets WHERE id = $1', [ticketId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      orgId: r.org_id,
      userId: r.user_id,
      userName: 'User',
      userEmail: 'user@example.com',
      subject: r.subject,
      description: r.subject,
      status: r.status,
      severity: r.priority || 'MEDIUM',
      category: r.category,
      messages: r.messages || [],
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
    } as unknown as SupportTicket;
  }

  public async listSupportTickets(orgId: string): Promise<SupportTicket[]> {
    const res = await this.pool.query('SELECT id, org_id, user_id, subject, status, priority, category, messages, created_at, updated_at FROM support_tickets WHERE org_id = $1 ORDER BY updated_at DESC', [orgId]);
    return res.rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      userId: r.user_id,
      userName: 'User',
      userEmail: 'user@example.com',
      subject: r.subject,
      description: r.subject,
      status: r.status,
      severity: r.priority || 'MEDIUM',
      category: r.category,
      messages: r.messages || [],
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
    })) as unknown as SupportTicket[];
  }

  public async saveSupportTicket(ticket: SupportTicket): Promise<SupportTicket> {
    await this.pool.query(
      `INSERT INTO support_tickets (id, org_id, user_id, subject, status, priority, category, messages, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status,
           priority = EXCLUDED.priority,
           category = EXCLUDED.category,
           messages = EXCLUDED.messages,
           updated_at = NOW()`,
      [
        ticket.id,
        ticket.orgId,
        ticket.userId,
        ticket.subject,
        ticket.status,
        (ticket as any).severity || (ticket as any).priority || 'MEDIUM',
        ticket.category || 'general',
        JSON.stringify((ticket as any).messages || []),
        new Date(ticket.createdAt || Date.now())
      ]
    );
    return ticket;
  }

  // --- Clusters ---
  public async getCluster(clusterId: string, orgId?: string): Promise<Cluster | null> {
    const queryStr = orgId
      ? 'SELECT id, org_id, name, environment, status, version, agent_version, last_heartbeat, metadata, created_at FROM clusters WHERE id = $1 AND org_id = $2'
      : 'SELECT id, org_id, name, environment, status, version, agent_version, last_heartbeat, metadata, created_at FROM clusters WHERE id = $1';
    const params = orgId ? [clusterId, orgId] : [clusterId];
    const res = await this.pool.query(queryStr, params);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      orgId: r.org_id,
      name: r.name,
      environment: r.environment,
      status: r.status,
      version: r.version,
      agentVersion: r.agent_version,
      lastHeartbeat: r.last_heartbeat ? new Date(r.last_heartbeat).getTime() : undefined,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      ...(r.metadata || {})
    };
  }

  public async listClusters(orgId?: string): Promise<Cluster[]> {
    const queryStr = orgId
      ? 'SELECT id, org_id, name, environment, status, version, agent_version, last_heartbeat, metadata, created_at FROM clusters WHERE org_id = $1 ORDER BY created_at ASC'
      : 'SELECT id, org_id, name, environment, status, version, agent_version, last_heartbeat, metadata, created_at FROM clusters ORDER BY created_at ASC';
    const params = orgId ? [orgId] : [];
    const res = await this.pool.query(queryStr, params);
    return res.rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      name: r.name,
      environment: r.environment,
      status: r.status,
      version: r.version,
      agentVersion: r.agent_version,
      lastHeartbeat: r.last_heartbeat ? new Date(r.last_heartbeat).getTime() : undefined,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      ...(r.metadata || {})
    }));
  }

  public async upsertCluster(cluster: Cluster): Promise<Cluster> {
    const { id, orgId, name, environment, status, agentVersion, lastHeartbeat, createdAt, ...metadata } = cluster;
    const version = cluster.k8sVersion || (cluster as any).version || null;
    await this.pool.query(
      `INSERT INTO clusters (id, org_id, name, environment, status, version, agent_version, last_heartbeat, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           environment = EXCLUDED.environment,
           status = EXCLUDED.status,
           version = COALESCE(EXCLUDED.version, clusters.version),
           agent_version = COALESCE(EXCLUDED.agent_version, clusters.agent_version),
           last_heartbeat = COALESCE(EXCLUDED.last_heartbeat, clusters.last_heartbeat),
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
      [
        id,
        orgId,
        name,
        environment || 'production',
        status || 'PENDING',
        version,
        agentVersion || null,
        lastHeartbeat ? new Date(lastHeartbeat) : null,
        JSON.stringify(metadata)
      ]
    );
    return cluster;
  }

  public async deleteCluster(clusterId: string, orgId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM clusters WHERE id = $1 AND org_id = $2', [clusterId, orgId]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Cluster Tokens ---
  public async getClusterTokenByHash(tokenHash: string): Promise<ClusterTokenRecord | null> {
    const res = await this.pool.query('SELECT id, token_hash, cluster_id, org_id, created_at, revoked_at, last_used_at FROM cluster_tokens WHERE token_hash = $1', [tokenHash]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      tokenHash: r.token_hash,
      clusterId: r.cluster_id,
      orgId: r.org_id,
      createdAt: new Date(r.created_at).getTime(),
      revokedAt: r.revoked_at ? new Date(r.revoked_at).getTime() : undefined,
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at).getTime() : undefined
    };
  }

  public async listClusterTokens(clusterId?: string, orgId?: string): Promise<ClusterTokenRecord[]> {
    let queryStr = 'SELECT id, token_hash, cluster_id, org_id, created_at, revoked_at, last_used_at FROM cluster_tokens';
    const conditions: string[] = [];
    const params: any[] = [];
    if (clusterId) {
      params.push(clusterId);
      conditions.push(`cluster_id = $${params.length}`);
    }
    if (orgId) {
      params.push(orgId);
      conditions.push(`org_id = $${params.length}`);
    }
    if (conditions.length > 0) {
      queryStr += ' WHERE ' + conditions.join(' AND ');
    }
    const res = await this.pool.query(queryStr, params);
    return res.rows.map((r) => ({
      id: r.id,
      tokenHash: r.token_hash,
      clusterId: r.cluster_id,
      orgId: r.org_id,
      createdAt: new Date(r.created_at).getTime(),
      revokedAt: r.revoked_at ? new Date(r.revoked_at).getTime() : undefined,
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at).getTime() : undefined
    }));
  }

  public async saveClusterToken(record: ClusterTokenRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO cluster_tokens (id, token_hash, cluster_id, org_id, created_at, revoked_at, last_used_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (token_hash) DO UPDATE
       SET revoked_at = EXCLUDED.revoked_at,
           last_used_at = EXCLUDED.last_used_at`,
      [
        record.id,
        record.tokenHash,
        record.clusterId,
        record.orgId,
        new Date(record.createdAt || Date.now()),
        record.revokedAt ? new Date(record.revokedAt) : null,
        record.lastUsedAt ? new Date(record.lastUsedAt) : null
      ]
    );
  }

  public async deleteClusterToken(tokenHash: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM cluster_tokens WHERE token_hash = $1', [tokenHash]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Cluster Resources ---
  public async getClusterResources(clusterId: string, orgId?: string): Promise<KubernetesResource[]> {
    const queryStr = orgId
      ? 'SELECT resources FROM cluster_resources WHERE cluster_id = $1 AND org_id = $2'
      : 'SELECT resources FROM cluster_resources WHERE cluster_id = $1';
    const params = orgId ? [clusterId, orgId] : [clusterId];
    const res = await this.pool.query(queryStr, params);
    if (res.rows.length === 0) return [];
    return res.rows[0].resources as KubernetesResource[];
  }

  public async saveClusterResources(clusterId: string, orgId: string, resources: KubernetesResource[]): Promise<void> {
    await this.pool.query(
      `INSERT INTO cluster_resources (cluster_id, org_id, resources, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (cluster_id) DO UPDATE
       SET resources = EXCLUDED.resources, org_id = EXCLUDED.org_id, updated_at = NOW()`,
      [clusterId, orgId, JSON.stringify(resources || [])]
    );
  }

  // --- Cluster Metric History ---
  public async getClusterMetricHistory(clusterId: string, orgId?: string): Promise<MetricHistoryPoint[]> {
    const queryStr = orgId
      ? 'SELECT timestamp, metrics FROM cluster_metric_history WHERE cluster_id = $1 AND org_id = $2 ORDER BY timestamp DESC LIMIT 200'
      : 'SELECT timestamp, metrics FROM cluster_metric_history WHERE cluster_id = $1 ORDER BY timestamp DESC LIMIT 200';
    const params = orgId ? [clusterId, orgId] : [clusterId];
    const res = await this.pool.query(queryStr, params);
    return res.rows.map((r) => ({
      timestamp: new Date(r.timestamp).getTime(),
      ...(r.metrics || {})
    }));
  }

  public async saveClusterMetricHistory(clusterId: string, orgId: string, history: MetricHistoryPoint[]): Promise<void> {
    if (!history || history.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const pt of history) {
        const id = `mh-${clusterId}-${pt.timestamp}`;
        const { timestamp, ...metrics } = pt;
        await client.query(
          `INSERT INTO cluster_metric_history (id, cluster_id, org_id, timestamp, metrics)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [id, clusterId, orgId, new Date(timestamp || Date.now()), JSON.stringify(metrics)]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --- Incidents ---
  // --- Incidents ---
  public async getIncident(incidentId: string, orgId?: string): Promise<Incident | null> {
    const queryStr = orgId
      ? 'SELECT id, org_id, cluster_id, title, description, severity, status, namespace, affected_resources, root_cause, created_at, updated_at, resolved_at FROM incidents WHERE id = $1 AND org_id = $2'
      : 'SELECT id, org_id, cluster_id, title, description, severity, status, namespace, affected_resources, root_cause, created_at, updated_at, resolved_at FROM incidents WHERE id = $1';
    const params = orgId ? [incidentId, orgId] : [incidentId];
    const res = await this.pool.query(queryStr, params);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      fingerprint: r.id,
      orgId: r.org_id,
      clusterId: r.cluster_id,
      clusterName: r.cluster_id,
      title: r.title,
      summary: r.description,
      severity: r.severity,
      status: r.status,
      namespace: r.namespace || 'default',
      resourceKind: 'Workload',
      resourceName: r.title,
      incidentType: 'CRASH_LOOP_BACKOFF',
      occurrenceCount: 1,
      firstSeenAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      lastSeenAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
      technicalDetails: { message: r.description || '' },
      rootCauseAnalysis: r.root_cause,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).getTime() : undefined
    } as unknown as Incident;
  }

  public async listIncidents(orgId?: string, clusterId?: string): Promise<Incident[]> {
    let queryStr = 'SELECT id, org_id, cluster_id, title, description, severity, status, namespace, affected_resources, root_cause, created_at, updated_at, resolved_at FROM incidents';
    const conditions: string[] = [];
    const params: any[] = [];
    if (orgId) {
      params.push(orgId);
      conditions.push(`org_id = $${params.length}`);
    }
    if (clusterId) {
      params.push(clusterId);
      conditions.push(`cluster_id = $${params.length}`);
    }
    if (conditions.length > 0) {
      queryStr += ' WHERE ' + conditions.join(' AND ');
    }
    queryStr += ' ORDER BY created_at DESC';
    const res = await this.pool.query(queryStr, params);
    return res.rows.map((r) => ({
      id: r.id,
      fingerprint: r.id,
      orgId: r.org_id,
      clusterId: r.cluster_id,
      clusterName: r.cluster_id,
      title: r.title,
      summary: r.description,
      severity: r.severity,
      status: r.status,
      namespace: r.namespace || 'default',
      resourceKind: 'Workload',
      resourceName: r.title,
      incidentType: 'CRASH_LOOP_BACKOFF',
      occurrenceCount: 1,
      firstSeenAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      lastSeenAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
      technicalDetails: { message: r.description || '' },
      rootCauseAnalysis: r.root_cause,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).getTime() : undefined
    })) as unknown as Incident[];
  }

  public async upsertIncident(incident: Incident): Promise<Incident> {
    await this.pool.query(
      `INSERT INTO incidents (id, org_id, cluster_id, title, description, severity, status, namespace, affected_resources, root_cause, created_at, updated_at, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           description = EXCLUDED.description,
           severity = EXCLUDED.severity,
           status = EXCLUDED.status,
           namespace = EXCLUDED.namespace,
           affected_resources = EXCLUDED.affected_resources,
           root_cause = COALESCE(EXCLUDED.root_cause, incidents.root_cause),
           updated_at = NOW(),
           resolved_at = COALESCE(EXCLUDED.resolved_at, incidents.resolved_at)`,
      [
        incident.id,
        incident.orgId,
        incident.clusterId,
        incident.title,
        incident.summary || (incident as any).description || '',
        incident.severity,
        incident.status,
        incident.namespace || null,
        JSON.stringify((incident as any).affectedResources || []),
        incident.rootCauseAnalysis || (incident as any).rootCause || null,
        new Date((incident as any).createdAt || incident.firstSeenAt || Date.now()),
        incident.resolvedAt ? new Date(incident.resolvedAt) : null
      ]
    );
    return incident;
  }

  public async deleteIncident(incidentId: string, orgId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM incidents WHERE id = $1 AND org_id = $2', [incidentId, orgId]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Incident Timeline ---
  public async getIncidentTimeline(incidentId: string, orgId?: string): Promise<TimelineEvent[]> {
    const queryStr = orgId
      ? 'SELECT id, timestamp, event_type, title, description, actor, metadata FROM incident_timeline WHERE incident_id = $1 AND org_id = $2 ORDER BY timestamp ASC'
      : 'SELECT id, timestamp, event_type, title, description, actor, metadata FROM incident_timeline WHERE incident_id = $1 ORDER BY timestamp ASC';
    const params = orgId ? [incidentId, orgId] : [incidentId];
    const res = await this.pool.query(queryStr, params);
    return res.rows.map((r) => ({
      id: r.id,
      incidentId,
      timestamp: new Date(r.timestamp).getTime(),
      type: r.event_type,
      actor: typeof r.actor === 'string' ? { type: 'SYSTEM' as const, name: r.actor } : (r.actor || { type: 'SYSTEM' as const, name: 'System' }),
      description: r.description || r.title || '',
      metadata: r.metadata
    }));
  }

  public async addTimelineEvent(incidentId: string, event: TimelineEvent, orgId: string): Promise<TimelineEvent> {
    const id = event.id || `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await this.pool.query(
      `INSERT INTO incident_timeline (id, incident_id, org_id, timestamp, event_type, title, description, actor, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        incidentId,
        orgId,
        new Date(event.timestamp || Date.now()),
        event.type,
        (event as any).title || event.description || '',
        event.description || '',
        JSON.stringify(event.actor || { type: 'SYSTEM', name: 'System' }),
        JSON.stringify(event.metadata || {})
      ]
    );
    return { ...event, id };
  }

  public async setIncidentTimeline(incidentId: string, events: TimelineEvent[], orgId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM incident_timeline WHERE incident_id = $1 AND org_id = $2', [incidentId, orgId]);
      for (const ev of events) {
        const id = ev.id || `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await client.query(
          `INSERT INTO incident_timeline (id, incident_id, org_id, timestamp, event_type, title, description, actor, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            incidentId,
            orgId,
            new Date(ev.timestamp || Date.now()),
            ev.type,
            (ev as any).title || ev.description || '',
            ev.description || '',
            JSON.stringify(ev.actor || { type: 'SYSTEM', name: 'System' }),
            JSON.stringify(ev.metadata || {})
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --- Incident Notes ---
  public async getIncidentNotes(incidentId: string, orgId?: string): Promise<IncidentNote[]> {
    const queryStr = orgId
      ? 'SELECT id, incident_id, user_id, user_name, text, created_at FROM incident_notes WHERE incident_id = $1 AND org_id = $2 ORDER BY created_at ASC'
      : 'SELECT id, incident_id, user_id, user_name, text, created_at FROM incident_notes WHERE incident_id = $1 ORDER BY created_at ASC';
    const params = orgId ? [incidentId, orgId] : [incidentId];
    const res = await this.pool.query(queryStr, params);
    return res.rows.map((r) => ({
      id: r.id,
      incidentId: r.incident_id,
      authorId: r.user_id || 'system',
      authorName: r.user_name || 'System',
      authorEmail: 'user@example.com',
      content: r.text || '',
      createdAt: new Date(r.created_at).getTime()
    }));
  }

  public async addIncidentNote(incidentId: string, note: IncidentNote, orgId: string): Promise<IncidentNote> {
    const id = note.id || `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await this.pool.query(
      `INSERT INTO incident_notes (id, incident_id, org_id, user_id, user_name, text, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        incidentId,
        orgId,
        note.authorId || (note as any).userId || null,
        note.authorName || (note as any).userName || 'Anonymous',
        note.content || (note as any).text || '',
        new Date(note.createdAt || Date.now())
      ]
    );
    return { ...note, id };
  }

  public async deleteIncidentNote(incidentId: string, noteId: string, orgId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM incident_notes WHERE id = $1 AND incident_id = $2 AND org_id = $3', [noteId, incidentId, orgId]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Remediations ---
  public async getRemediation(incidentId: string, orgId?: string): Promise<StructuredRemediation | null> {
    const queryStr = orgId
      ? 'SELECT remediation_data FROM remediations WHERE incident_id = $1 AND org_id = $2'
      : 'SELECT remediation_data FROM remediations WHERE incident_id = $1';
    const params = orgId ? [incidentId, orgId] : [incidentId];
    const res = await this.pool.query(queryStr, params);
    if (res.rows.length === 0) return null;
    return res.rows[0].remediation_data as StructuredRemediation;
  }

  public async saveRemediation(incidentId: string, remediation: StructuredRemediation, orgId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO remediations (incident_id, org_id, remediation_data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (incident_id) DO UPDATE
       SET remediation_data = EXCLUDED.remediation_data, org_id = EXCLUDED.org_id, updated_at = NOW()`,
      [incidentId, orgId, JSON.stringify(remediation)]
    );
  }

  // --- Remediation Actions ---
  public async getRemediationAction(actionId: string, orgId?: string): Promise<RemediationAction | null> {
    const queryStr = orgId
      ? 'SELECT id, incident_id, org_id, cluster_id, type, status, target_resource, idempotency_key, requested_by, approved_by, execution_result, created_at, updated_at FROM remediation_actions WHERE id = $1 AND org_id = $2'
      : 'SELECT id, incident_id, org_id, cluster_id, type, status, target_resource, idempotency_key, requested_by, approved_by, execution_result, created_at, updated_at FROM remediation_actions WHERE id = $1';
    const params = orgId ? [actionId, orgId] : [actionId];
    const res = await this.pool.query(queryStr, params);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    const targetObj = typeof r.target_resource === 'string' ? JSON.parse(r.target_resource) : (r.target_resource || {});
    return {
      id: r.id,
      incidentId: r.incident_id,
      orgId: r.org_id,
      clusterId: r.cluster_id,
      actionType: r.type,
      type: r.type,
      target: targetObj.target || targetObj,
      fieldPath: 'spec.template.spec.containers[0].image',
      expectedCurrentValue: '',
      proposedValue: '',
      status: r.status,
      idempotencyKey: r.idempotency_key,
      requestedBy: r.requested_by,
      approvedBy: r.approved_by,
      executionResult: r.execution_result,
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime()
    } as unknown as RemediationAction;
  }

  public async listRemediationActions(orgId?: string, incidentId?: string): Promise<RemediationAction[]> {
    let queryStr = 'SELECT id, incident_id, org_id, cluster_id, type, status, target_resource, idempotency_key, requested_by, approved_by, execution_result, created_at, updated_at FROM remediation_actions';
    const conditions: string[] = [];
    const params: any[] = [];
    if (orgId) {
      params.push(orgId);
      conditions.push(`org_id = $${params.length}`);
    }
    if (incidentId) {
      params.push(incidentId);
      conditions.push(`incident_id = $${params.length}`);
    }
    if (conditions.length > 0) {
      queryStr += ' WHERE ' + conditions.join(' AND ');
    }
    queryStr += ' ORDER BY created_at DESC';
    const res = await this.pool.query(queryStr, params);
    return res.rows.map((r) => {
      const targetObj = typeof r.target_resource === 'string' ? JSON.parse(r.target_resource) : (r.target_resource || {});
      return {
        id: r.id,
        incidentId: r.incident_id,
        orgId: r.org_id,
        clusterId: r.cluster_id,
        actionType: r.type,
        type: r.type,
        target: targetObj.target || targetObj,
        fieldPath: 'spec.template.spec.containers[0].image',
        expectedCurrentValue: '',
        proposedValue: '',
        status: r.status,
        idempotencyKey: r.idempotency_key,
        requestedBy: r.requested_by,
        approvedBy: r.approved_by,
        executionResult: r.execution_result,
        createdAt: new Date(r.created_at).getTime(),
        updatedAt: new Date(r.updated_at).getTime()
      } as unknown as RemediationAction;
    });
  }

  public async saveRemediationAction(action: RemediationAction): Promise<RemediationAction> {
    await this.pool.query(
      `INSERT INTO remediation_actions (id, incident_id, org_id, cluster_id, type, status, target_resource, idempotency_key, requested_by, approved_by, execution_result, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status,
           execution_result = EXCLUDED.execution_result,
           approved_by = COALESCE(EXCLUDED.approved_by, remediation_actions.approved_by),
           updated_at = NOW()`,
      [
        action.id,
        action.incidentId,
        action.orgId,
        action.clusterId,
        action.type,
        action.status,
        JSON.stringify((action as any).target || (action as any).targetResource || {}),
        action.idempotencyKey || null,
        action.requestedBy || null,
        action.approvedBy || null,
        action.executionResult ? JSON.stringify(action.executionResult) : null,
        new Date(action.createdAt || Date.now())
      ]
    );
    return action;
  }

  // --- AI Analyses ---
  public async getAIAnalysis(incidentId: string, orgId?: string): Promise<SkyOpsAIAnalysis | null> {
    const queryStr = orgId
      ? 'SELECT analysis FROM ai_analyses WHERE incident_id = $1 AND org_id = $2'
      : 'SELECT analysis FROM ai_analyses WHERE incident_id = $1';
    const params = orgId ? [incidentId, orgId] : [incidentId];
    const res = await this.pool.query(queryStr, params);
    if (res.rows.length === 0) return null;
    return res.rows[0].analysis as SkyOpsAIAnalysis;
  }

  public async saveAIAnalysis(incidentId: string, analysis: SkyOpsAIAnalysis, orgId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_analyses (incident_id, org_id, analysis, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (incident_id) DO UPDATE
       SET analysis = EXCLUDED.analysis, org_id = EXCLUDED.org_id, created_at = NOW()`,
      [incidentId, orgId, JSON.stringify(analysis)]
    );
  }

  // --- Policies ---
  public async getPolicy(policyId: string, orgId?: string): Promise<RemediationPolicy | null> {
    const queryStr = orgId
      ? 'SELECT id, org_id, definition, created_at, updated_at FROM policies WHERE id = $1 AND org_id = $2'
      : 'SELECT id, org_id, definition, created_at, updated_at FROM policies WHERE id = $1';
    const params = orgId ? [policyId, orgId] : [policyId];
    const res = await this.pool.query(queryStr, params);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      orgId: r.org_id,
      ...(r.definition || {}),
      id: r.id
    } as RemediationPolicy;
  }

  public async listPolicies(orgId: string): Promise<RemediationPolicy[]> {
    const res = await this.pool.query('SELECT id, org_id, definition, created_at, updated_at FROM policies WHERE org_id = $1 ORDER BY created_at ASC', [orgId]);
    return res.rows.map((r) => ({
      orgId: r.org_id,
      ...(r.definition || {}),
      id: r.id
    })) as RemediationPolicy[];
  }

  public async savePolicy(policy: RemediationPolicy): Promise<RemediationPolicy> {
    const docId = (policy as any).id || (policy.clusterId ? `${policy.orgId}_${policy.clusterId}` : policy.orgId);
    await this.pool.query(
      `INSERT INTO policies (id, org_id, name, type, enabled, definition, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           type = EXCLUDED.type,
           enabled = EXCLUDED.enabled,
           definition = EXCLUDED.definition,
           updated_at = NOW()`,
      [
        docId,
        policy.orgId,
        (policy as any).name || (policy.clusterId ? `Policy-${policy.clusterId}` : 'Default Policy'),
        (policy as any).type || policy.remediationMode || 'CUSTOM',
        (policy as any).enabled !== false,
        JSON.stringify(policy)
      ]
    );
    return policy;
  }

  public async deletePolicy(policyId: string, orgId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM policies WHERE id = $1 AND org_id = $2', [policyId, orgId]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Audit Events ---
  public async recordAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    await this.pool.query(
      `INSERT INTO audit_events (id, org_id, actor_user_id, actor_email, actor_role, action, resource_type, resource_id, details, ip_address, user_agent, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        event.id,
        event.orgId,
        event.actorId || null,
        event.actorName || null,
        event.actorType || null,
        event.action,
        event.resourceType,
        event.resourceId || null,
        JSON.stringify(event.details || {}),
        event.ipAddress || null,
        (event as any).userAgent || null,
        new Date(event.timestamp || Date.now())
      ]
    );
    return event;
  }

  public async queryAuditEvents(filters: AuditQueryFilters): Promise<PaginatedResult<AuditEvent>> {
    let queryStr = 'SELECT id, org_id, actor_user_id, actor_email, actor_role, action, resource_type, resource_id, details, ip_address, user_agent, timestamp FROM audit_events';
    const conditions: string[] = ['org_id = $1'];
    const params: any[] = [filters.orgId];

    if (filters.action) {
      params.push(filters.action);
      conditions.push(`action = $${params.length}`);
    }
    if (filters.resourceType) {
      params.push(filters.resourceType);
      conditions.push(`resource_type = $${params.length}`);
    }
    if (filters.actorId) {
      params.push(filters.actorId);
      conditions.push(`actor_user_id = $${params.length}`);
    }
    if (filters.fromTimestamp) {
      params.push(new Date(filters.fromTimestamp));
      conditions.push(`timestamp >= $${params.length}`);
    }
    if (filters.toTimestamp) {
      params.push(new Date(filters.toTimestamp));
      conditions.push(`timestamp <= $${params.length}`);
    }

    queryStr += ' WHERE ' + conditions.join(' AND ');
    queryStr += ' ORDER BY timestamp DESC';

    const limit = filters.limit || 50;
    params.push(limit);
    queryStr += ` LIMIT $${params.length}`;

    if (filters.offset) {
      params.push(filters.offset);
      queryStr += ` OFFSET $${params.length}`;
    }

    const res = await this.pool.query(queryStr, params);
    const items: AuditEvent[] = res.rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      actorId: r.actor_user_id || 'system',
      actorName: r.actor_email || 'System',
      actorType: (r.actor_role as any) || 'SYSTEM',
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      result: 'SUCCESS' as const,
      details: r.details || {},
      ipAddress: r.ip_address,
      hash: r.id,
      timestamp: new Date(r.timestamp).getTime()
    }));

    return {
      items,
      total: items.length,
      page: 1,
      totalPages: 1,
      limit
    };
  }

  // --- Webhooks ---
  public async getWebhook(webhookId: string, orgId?: string): Promise<WebhookConfig | null> {
    const queryStr = orgId
      ? 'SELECT id, org_id, name, url, secret, events, enabled, created_at, updated_at FROM webhooks WHERE id = $1 AND org_id = $2'
      : 'SELECT id, org_id, name, url, secret, events, enabled, created_at, updated_at FROM webhooks WHERE id = $1';
    const params = orgId ? [webhookId, orgId] : [webhookId];
    const res = await this.pool.query(queryStr, params);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      orgId: r.org_id,
      name: r.name,
      url: r.url,
      secret: r.secret,
      enabledEvents: (r.events || []) as any,
      isActive: r.enabled ?? true,
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime()
    };
  }

  public async listWebhooks(orgId: string): Promise<WebhookConfig[]> {
    const res = await this.pool.query('SELECT id, org_id, name, url, secret, events, enabled, created_at, updated_at FROM webhooks WHERE org_id = $1 ORDER BY created_at ASC', [orgId]);
    return res.rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      name: r.name,
      url: r.url,
      secret: r.secret,
      enabledEvents: (r.events || []) as any,
      isActive: r.enabled ?? true,
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime()
    }));
  }

  public async saveWebhook(webhook: WebhookConfig): Promise<WebhookConfig> {
    await this.pool.query(
      `INSERT INTO webhooks (id, org_id, name, url, secret, events, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           url = EXCLUDED.url,
           secret = EXCLUDED.secret,
           events = EXCLUDED.events,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()`,
      [
        webhook.id,
        webhook.orgId,
        webhook.name,
        webhook.url,
        webhook.secret || null,
        JSON.stringify(webhook.enabledEvents || []),
        webhook.isActive ?? true,
        new Date(webhook.createdAt || Date.now())
      ]
    );
    return webhook;
  }

  public async deleteWebhook(webhookId: string, orgId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM webhooks WHERE id = $1 AND org_id = $2', [webhookId, orgId]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Webhook Deliveries ---
  public async recordWebhookDelivery(delivery: WebhookDeliveryRecord): Promise<WebhookDeliveryRecord> {
    await this.pool.query(
      `INSERT INTO webhook_deliveries (id, webhook_id, org_id, event, payload, status_code, success, latency_ms, attempt, error_message, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        delivery.id,
        delivery.webhookId,
        delivery.orgId,
        delivery.event,
        JSON.stringify(delivery.payload),
        delivery.statusCode || null,
        delivery.success,
        delivery.durationMs || 0,
        delivery.attempts || 1,
        delivery.error || null,
        new Date(delivery.timestamp || Date.now())
      ]
    );
    return delivery;
  }

  public async listWebhookDeliveries(orgId: string, webhookId?: string, limit = 50): Promise<WebhookDeliveryRecord[]> {
    let queryStr = 'SELECT id, webhook_id, org_id, event, payload, status_code, success, latency_ms, attempt, error_message, timestamp FROM webhook_deliveries WHERE org_id = $1';
    const params: any[] = [orgId];
    if (webhookId) {
      params.push(webhookId);
      queryStr += ` AND webhook_id = $${params.length}`;
    }
    queryStr += ' ORDER BY timestamp DESC';
    params.push(limit);
    queryStr += ` LIMIT $${params.length}`;

    const res = await this.pool.query(queryStr, params);
    return res.rows.map((r) => ({
      id: r.id,
      webhookId: r.webhook_id,
      orgId: r.org_id,
      event: r.event,
      payload: r.payload,
      statusCode: r.status_code,
      success: r.success,
      durationMs: r.latency_ms || 0,
      attempts: r.attempt || 1,
      error: r.error_message,
      timestamp: new Date(r.timestamp).getTime()
    }));
  }

  // --- Subscriptions & Invoices ---
  public async getSubscription(orgId: string): Promise<Subscription | null> {
    const res = await this.pool.query('SELECT org_id, plan_id, status, current_period_end, license_type, metadata FROM subscriptions WHERE org_id = $1', [orgId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.org_id,
      organizationId: r.org_id,
      planId: r.plan_id,
      status: r.status,
      billingInterval: 'MONTHLY' as any,
      currentPeriodEnd: r.current_period_end ? new Date(r.current_period_end).getTime() : Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(r.metadata || {})
    } as Subscription;
  }

  public async saveSubscription(subscription: Subscription): Promise<Subscription> {
    const orgId = subscription.organizationId || (subscription as any).orgId;
    await this.pool.query(
      `INSERT INTO subscriptions (org_id, plan_id, status, current_period_end, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (org_id) DO UPDATE
       SET plan_id = EXCLUDED.plan_id,
           status = EXCLUDED.status,
           current_period_end = EXCLUDED.current_period_end,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
      [
        orgId,
        subscription.planId,
        subscription.status,
        subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null,
        JSON.stringify(subscription)
      ]
    );
    return subscription;
  }

  public async getInvoice(invoiceId: string, orgId?: string): Promise<Invoice | null> {
    const queryStr = orgId
      ? 'SELECT id, org_id, amount, currency, status, invoice_url, created_at FROM invoices WHERE id = $1 AND org_id = $2'
      : 'SELECT id, org_id, amount, currency, status, invoice_url, created_at FROM invoices WHERE id = $1';
    const params = orgId ? [invoiceId, orgId] : [invoiceId];
    const res = await this.pool.query(queryStr, params);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      organizationId: r.org_id,
      subscriptionId: r.id,
      amount: parseFloat(r.amount || '0'),
      currency: r.currency || 'USD',
      status: r.status || 'PAID',
      invoiceUrl: r.invoice_url,
      issuedAt: new Date(r.created_at).getTime(),
      dueAt: new Date(r.created_at).getTime(),
      paidAt: new Date(r.created_at).getTime(),
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.created_at).getTime()
    } as unknown as Invoice;
  }

  public async listInvoices(orgId: string): Promise<Invoice[]> {
    const res = await this.pool.query('SELECT id, org_id, amount, currency, status, invoice_url, created_at FROM invoices WHERE org_id = $1 ORDER BY created_at DESC', [orgId]);
    return res.rows.map((r) => ({
      id: r.id,
      organizationId: r.org_id,
      subscriptionId: r.id,
      amount: parseFloat(r.amount || '0'),
      currency: r.currency || 'USD',
      status: r.status || 'PAID',
      invoiceUrl: r.invoice_url,
      issuedAt: new Date(r.created_at).getTime(),
      dueAt: new Date(r.created_at).getTime(),
      paidAt: new Date(r.created_at).getTime(),
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.created_at).getTime()
    })) as unknown as Invoice[];
  }

  public async saveInvoice(invoice: Invoice): Promise<Invoice> {
    const orgId = invoice.organizationId || (invoice as any).orgId;
    await this.pool.query(
      `INSERT INTO invoices (id, org_id, amount, currency, status, invoice_url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
       SET amount = EXCLUDED.amount,
           currency = EXCLUDED.currency,
           status = EXCLUDED.status,
           invoice_url = EXCLUDED.invoice_url`,
      [
        invoice.id,
        orgId,
        invoice.amount,
        invoice.currency || 'USD',
        invoice.status,
        invoice.invoiceUrl || (invoice as any).downloadUrl || null,
        new Date(invoice.createdAt || invoice.issuedAt || Date.now())
      ]
    );
    return invoice;
  }

  // --- Usage Summaries ---
  public async getUsage(orgId: string, period: string): Promise<OrgUsageSummary | null> {
    const res = await this.pool.query('SELECT org_id, period, metrics FROM org_usage WHERE org_id = $1 AND period = $2', [orgId, period]);
    if (res.rows.length === 0) return null;
    return {
      orgId: res.rows[0].org_id,
      period: res.rows[0].period,
      ...(res.rows[0].metrics || {})
    };
  }

  public async saveUsage(summary: OrgUsageSummary): Promise<void> {
    const { orgId, period, ...metrics } = summary;
    await this.pool.query(
      `INSERT INTO org_usage (id, org_id, period, metrics, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (org_id, period) DO UPDATE
       SET metrics = EXCLUDED.metrics, updated_at = NOW()`,
      [`usage-${orgId}-${period}`, orgId, period, JSON.stringify(metrics)]
    );
  }

  // --- Processed Webhooks (Idempotency) ---
  public async isWebhookProcessed(webhookId: string): Promise<boolean> {
    const res = await this.pool.query('SELECT webhook_id FROM processed_webhooks WHERE webhook_id = $1', [webhookId]);
    return res.rows.length > 0;
  }

  public async markWebhookProcessed(webhookId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO processed_webhooks (webhook_id, processed_at)
       VALUES ($1, NOW())
       ON CONFLICT (webhook_id) DO NOTHING`,
      [webhookId]
    );
  }

  // --- Stored Artifacts ---
  public async saveStoredArtifact(artifact: StoredArtifact): Promise<StoredArtifact> {
    await this.pool.query(
      `INSERT INTO stored_artifacts (id, org_id, category, file_name, file_path, mime_type, size_bytes, metadata, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status,
           metadata = EXCLUDED.metadata,
           size_bytes = EXCLUDED.size_bytes`,
      [
        artifact.id,
        artifact.orgId,
        artifact.category,
        artifact.filename,
        artifact.storagePath,
        artifact.mimeType,
        artifact.sizeBytes,
        JSON.stringify(artifact.metadata || {}),
        artifact.lifecycleStatus || 'ACTIVE',
        new Date(artifact.createdAt || Date.now())
      ]
    );
    return artifact;
  }

  public async getStoredArtifact(orgId: string, id: string): Promise<StoredArtifact | null> {
    const res = await this.pool.query(
      'SELECT id, org_id, category, file_name, file_path, mime_type, size_bytes, metadata, status, created_at FROM stored_artifacts WHERE id = $1 AND org_id = $2',
      [id, orgId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      orgId: r.org_id,
      category: r.category as any,
      filename: r.file_name,
      storagePath: r.file_path,
      storageBucket: 'default',
      mimeType: r.mime_type,
      checksumSha256: '',
      uploadedBy: { id: 'system', name: 'System', actorType: 'SYSTEM' as const },
      sizeBytes: parseInt(r.size_bytes || '0', 10),
      metadata: r.metadata || {},
      lifecycleStatus: (r.status as any) || 'ACTIVE',
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.created_at).getTime()
    };
  }

  public async listStoredArtifacts(orgId: string, filters?: StoredArtifactFilters): Promise<PaginatedResult<StoredArtifact>> {
    let queryStr = 'SELECT id, org_id, category, file_name, file_path, mime_type, size_bytes, metadata, status, created_at FROM stored_artifacts WHERE org_id = $1';
    const params: any[] = [orgId];
    if (filters?.category) {
      params.push(filters.category);
      queryStr += ` AND category = $${params.length}`;
    }
    if (filters?.lifecycleStatus) {
      params.push(filters.lifecycleStatus);
      queryStr += ` AND status = $${params.length}`;
    }
    queryStr += ' ORDER BY created_at DESC';
    const limit = filters?.limit || 50;
    params.push(limit);
    queryStr += ` LIMIT $${params.length}`;

    const res = await this.pool.query(queryStr, params);
    const items: StoredArtifact[] = res.rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      category: r.category as any,
      filename: r.file_name,
      storagePath: r.file_path,
      storageBucket: 'default',
      mimeType: r.mime_type,
      checksumSha256: '',
      uploadedBy: { id: 'system', name: 'System', actorType: 'SYSTEM' as const },
      sizeBytes: parseInt(r.size_bytes || '0', 10),
      metadata: r.metadata || {},
      lifecycleStatus: (r.status as any) || 'ACTIVE',
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.created_at).getTime()
    }));
    return {
      items,
      total: items.length,
      page: 1,
      totalPages: 1,
      limit
    };
  }

  public async updateStoredArtifactStatus(
    orgId: string,
    id: string,
    status: StoredArtifactLifecycleStatus
  ): Promise<StoredArtifact | null> {
    const res = await this.pool.query(
      `UPDATE stored_artifacts SET status = $1 WHERE id = $2 AND org_id = $3
       RETURNING id, org_id, category, file_name, file_path, mime_type, size_bytes, metadata, status, created_at`,
      [status, id, orgId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      orgId: r.org_id,
      category: r.category as any,
      filename: r.file_name,
      storagePath: r.file_path,
      storageBucket: 'default',
      mimeType: r.mime_type,
      checksumSha256: '',
      uploadedBy: { id: 'system', name: 'System', actorType: 'SYSTEM' as const },
      sizeBytes: parseInt(r.size_bytes || '0', 10),
      metadata: r.metadata || {},
      lifecycleStatus: (r.status as any) || 'ACTIVE',
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.created_at).getTime()
    };
  }

  public async deleteStoredArtifact(orgId: string, id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM stored_artifacts WHERE id = $1 AND org_id = $2', [id, orgId]);
    return (res.rowCount ?? 0) > 0;
  }

  public async getStorageUsageSummary(orgId: string): Promise<StorageUsageSummary> {
    const res = await this.pool.query(
      'SELECT category, COUNT(*) as count, SUM(size_bytes) as total_bytes FROM stored_artifacts WHERE org_id = $1 GROUP BY category',
      [orgId]
    );
    const categoryBreakdown: any = {
      'audit-exports': { sizeBytes: 0, count: 0 },
      'incident-artifacts': { sizeBytes: 0, count: 0 },
      'remediation-manifests': { sizeBytes: 0, count: 0 },
      'cluster-snapshots': { sizeBytes: 0, count: 0 },
      'ai-diagnostics': { sizeBytes: 0, count: 0 },
      'user-uploads': { sizeBytes: 0, count: 0 }
    };
    let totalSizeBytes = 0;
    let totalArtifactsCount = 0;

    for (const r of res.rows) {
      const cat = r.category;
      const cnt = parseInt(r.count || '0', 10);
      const bytes = parseInt(r.total_bytes || '0', 10);
      if (categoryBreakdown[cat]) {
        categoryBreakdown[cat].count = cnt;
        categoryBreakdown[cat].sizeBytes = bytes;
      }
      totalArtifactsCount += cnt;
      totalSizeBytes += bytes;
    }

    return {
      orgId,
      totalSizeBytes,
      totalArtifactsCount,
      categoryBreakdown,
      lastUpdatedAt: Date.now()
    };
  }

  // --- Operational Kubernetes Logs ---
  public async saveLogRecords(orgId: string, clusterId: string, records: LogRecord[]): Promise<void> {
    if (!records || records.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const rec of records) {
        await client.query(
          `INSERT INTO operational_logs (id, org_id, cluster_id, namespace, workload, pod_name, container, severity, timestamp, message, raw)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            rec.id,
            orgId,
            clusterId,
            rec.namespace || null,
            rec.workload || null,
            rec.podName || null,
            rec.container || null,
            rec.severity || 'info',
            new Date(rec.timestampMs || Date.now()),
            rec.message || '',
            rec.raw ? JSON.stringify(rec.raw) : null
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async queryLogRecords(
    orgId: string,
    filter: LogQueryFilter
  ): Promise<{ records: LogRecord[]; totalMatches: number }> {
    let queryStr = 'SELECT id, org_id, cluster_id, namespace, workload, pod_name, container, severity, timestamp, message, raw FROM operational_logs WHERE org_id = $1';
    const params: any[] = [orgId];

    if (filter.clusterId) {
      params.push(filter.clusterId);
      queryStr += ` AND cluster_id = $${params.length}`;
    }
    if (filter.namespace) {
      params.push(filter.namespace);
      queryStr += ` AND namespace = $${params.length}`;
    }
    if (filter.workload) {
      params.push(filter.workload);
      queryStr += ` AND workload = $${params.length}`;
    }
    if (filter.podName) {
      params.push(filter.podName);
      queryStr += ` AND pod_name = $${params.length}`;
    }
    if (filter.severity && filter.severity.length > 0) {
      params.push(filter.severity);
      queryStr += ` AND severity = ANY($${params.length})`;
    }
    if (filter.search) {
      params.push(`%${filter.search}%`);
      queryStr += ` AND message ILIKE $${params.length}`;
    }
    if (filter.startTimeMs) {
      params.push(new Date(filter.startTimeMs));
      queryStr += ` AND timestamp >= $${params.length}`;
    }
    if (filter.endTimeMs) {
      params.push(new Date(filter.endTimeMs));
      queryStr += ` AND timestamp <= $${params.length}`;
    }

    queryStr += ' ORDER BY timestamp DESC';
    const limit = filter.limit || 100;
    params.push(limit);
    queryStr += ` LIMIT $${params.length}`;

    const res = await this.pool.query(queryStr, params);
    const records: LogRecord[] = res.rows.map((r) => ({
      id: r.id,
      clusterId: r.cluster_id,
      namespace: r.namespace,
      workload: r.workload,
      podName: r.pod_name,
      container: r.container,
      severity: r.severity as any,
      timestamp: new Date(r.timestamp).toISOString(),
      timestampMs: new Date(r.timestamp).getTime(),
      message: r.message,
      raw: r.raw
    }));

    return {
      records,
      totalMatches: records.length
    };
  }

  public async getLogRecordCount(orgId: string, clusterId?: string): Promise<number> {
    const queryStr = clusterId
      ? 'SELECT COUNT(*) as count FROM operational_logs WHERE org_id = $1 AND cluster_id = $2'
      : 'SELECT COUNT(*) as count FROM operational_logs WHERE org_id = $1';
    const params = clusterId ? [orgId, clusterId] : [orgId];
    const res = await this.pool.query(queryStr, params);
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  public async deleteExpiredLogs(orgId: string, retentionDays: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 86400000);
    const res = await this.pool.query(
      'DELETE FROM operational_logs WHERE org_id = $1 AND timestamp < $2',
      [orgId, cutoffDate]
    );
    return res.rowCount ?? 0;
  }
}
