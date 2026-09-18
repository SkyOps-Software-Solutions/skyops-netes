import { Firestore, Query, DocumentData } from '@google-cloud/firestore';
import {
  Cluster,
  Incident,
  IncidentNote,
  KubernetesResource,
  Organization,
  OrgInvitation,
  OrgMember,
  RemediationAction,
  RemediationPolicy,
  SkyOpsAIAnalysis,
  StructuredRemediation,
  SupportTicket,
  TimelineEvent,
  User,
  UserNotificationSettings,
  Subscription,
  Invoice
} from '../../src/types/index';
import {
  AuditEvent,
  AuditQueryFilters,
  PaginatedResult,
  WebhookConfig,
  WebhookDeliveryRecord,
  OrgUsageSummary
} from '../repositories/types';
import { ClusterResourcesRecord, ClusterTokenRecord, IPersistenceStore } from './types';
import fallbackConfig from '../../firebase-applet-config.json';

export interface FirestoreStoreConfig {
  projectId?: string;
  databaseId?: string;
  keyFilename?: string;
}

export class FirestoreStore implements IPersistenceStore {
  public readonly providerName = 'firestore';
  private firestore: Firestore;
  private readonly projectId: string;
  private readonly databaseId: string;

  constructor(config?: FirestoreStoreConfig) {
    this.projectId =
      config?.projectId ||
      process.env.SKYOPS_FIRESTORE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      fallbackConfig.projectId;

    this.databaseId =
      config?.databaseId ||
      process.env.SKYOPS_FIRESTORE_DATABASE_ID ||
      process.env.FIREBASE_DATABASE_ID ||
      process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      (fallbackConfig as any).firestoreDatabaseId ||
      '(default)';

    if (!this.projectId) {
      throw new Error(
        '[FirestoreStore] Fatal Startup Error: Missing required Firestore projectId. Ensure SKYOPS_FIRESTORE_PROJECT_ID or FIREBASE_PROJECT_ID is configured.'
      );
    }

    const firestoreOptions: Record<string, any> = {
      projectId: this.projectId
    };

    if (this.databaseId && this.databaseId !== '(default)') {
      firestoreOptions.databaseId = this.databaseId;
    }

    if (config?.keyFilename || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firestoreOptions.keyFilename = config?.keyFilename || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }

    this.firestore = new Firestore(firestoreOptions);
  }

  public getDatabaseId(): string {
    return this.databaseId;
  }

  public getProjectId(): string {
    return this.projectId;
  }

  public async init(): Promise<void> {
    // Probe database connectivity
    try {
      await this.firestore.collection('organizations').limit(1).get();
      console.log(
        `[FirestoreStore] Connected to Firestore project="${this.projectId}", database="${this.databaseId}"`
      );
    } catch (err: any) {
      const msg = `[FirestoreStore] Failed to connect to Firestore (project="${this.projectId}", database="${this.databaseId}"): ${err?.message || err}`;
      if (process.env.NODE_ENV === 'production') {
        throw new Error(msg);
      }
      console.warn(msg);
    }
  }

  public async close(): Promise<void> {
    try {
      await this.firestore.terminate();
    } catch {
      // Ignore termination errors
    }
  }

  public async isHealthy(): Promise<boolean> {
    try {
      await this.firestore.collection('organizations').limit(1).get();
      return true;
    } catch {
      return false;
    }
  }

  // Helper to remove undefined fields before writing to Firestore
  private sanitize<T extends Record<string, any>>(data: T): T {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        clean[key] = value;
      }
    }
    return clean as T;
  }

  // --- Users ---
  public async getUser(userId: string): Promise<User | null> {
    const snap = await this.firestore.collection('users').doc(userId).get();
    if (!snap.exists) return null;
    return snap.data() as User;
  }

  public async upsertUser(user: User): Promise<User> {
    const docRef = this.firestore.collection('users').doc(user.id);
    const existing = await docRef.get();
    const updated: User = {
      ...(existing.exists ? (existing.data() as User) : {}),
      ...user
    };
    await docRef.set(this.sanitize(updated), { merge: true });
    return updated;
  }

  public async listUsers(): Promise<User[]> {
    const snap = await this.firestore.collection('users').get();
    return snap.docs.map((d) => d.data() as User);
  }

  // --- User Notification Settings ---
  public async getUserNotificationSettings(userId: string): Promise<UserNotificationSettings | null> {
    const snap = await this.firestore.collection('userNotificationSettings').doc(userId).get();
    if (!snap.exists) return null;
    return snap.data() as UserNotificationSettings;
  }

  public async saveUserNotificationSettings(userId: string, settings: UserNotificationSettings): Promise<void> {
    await this.firestore
      .collection('userNotificationSettings')
      .doc(userId)
      .set(this.sanitize({ ...settings, updatedAt: Date.now() }), { merge: true });
  }

  // --- Organizations ---
  public async getOrganization(orgId: string): Promise<Organization | null> {
    const snap = await this.firestore.collection('organizations').doc(orgId).get();
    if (!snap.exists) return null;
    return snap.data() as Organization;
  }

  public async upsertOrganization(org: Organization): Promise<Organization> {
    const docRef = this.firestore.collection('organizations').doc(org.id);
    const existing = await docRef.get();
    const updated: Organization = {
      ...(existing.exists ? (existing.data() as Organization) : {}),
      ...org,
      createdAt: existing.exists ? (existing.data() as Organization).createdAt : org.createdAt || Date.now()
    };
    await docRef.set(this.sanitize(updated), { merge: true });
    return updated;
  }

  public async listOrganizations(): Promise<Organization[]> {
    const snap = await this.firestore.collection('organizations').get();
    return snap.docs.map((d) => d.data() as Organization);
  }

  public async deleteOrganization(orgId: string): Promise<boolean> {
    const batch = this.firestore.batch();
    batch.delete(this.firestore.collection('organizations').doc(orgId));

    // Delete memberships for org
    const membersSnap = await this.firestore.collection('memberships').where('orgId', '==', orgId).get();
    for (const d of membersSnap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
    return true;
  }

  // --- Organization Memberships ---
  public async getOrgMembers(orgId: string): Promise<OrgMember[]> {
    const snap = await this.firestore.collection('memberships').where('orgId', '==', orgId).get();
    return snap.docs.map((d) => d.data() as OrgMember);
  }

  public async setOrgMembers(orgId: string, members: OrgMember[]): Promise<void> {
    const batch = this.firestore.batch();
    // Delete existing
    const existing = await this.firestore.collection('memberships').where('orgId', '==', orgId).get();
    for (const d of existing.docs) {
      batch.delete(d.ref);
    }
    // Add new
    for (const m of members) {
      const docId = `${orgId}_${m.userId}`;
      batch.set(this.firestore.collection('memberships').doc(docId), this.sanitize({ ...m, orgId }));
    }
    await batch.commit();
  }

  public async addOrgMember(orgId: string, member: OrgMember): Promise<OrgMember> {
    const docId = `${orgId}_${member.userId}`;
    const payload = this.sanitize({ ...member, orgId });
    await this.firestore.collection('memberships').doc(docId).set(payload, { merge: true });
    return member;
  }

  public async removeOrgMember(orgId: string, userId: string): Promise<boolean> {
    const docId = `${orgId}_${userId}`;
    await this.firestore.collection('memberships').doc(docId).delete();
    return true;
  }

  public async getUserOrganizations(userId: string, email?: string): Promise<Organization[]> {
    const orgIds = new Set<string>();

    const userMemberships = await this.firestore
      .collection('memberships')
      .where('userId', '==', userId)
      .get();

    for (const d of userMemberships.docs) {
      const data = d.data();
      if (data.orgId) orgIds.add(data.orgId);
    }

    if (email) {
      const emailMemberships = await this.firestore
        .collection('memberships')
        .where('email', '==', email.toLowerCase())
        .get();
      for (const d of emailMemberships.docs) {
        const data = d.data();
        if (data.orgId) orgIds.add(data.orgId);
      }
    }

    const orgs: Organization[] = [];
    for (const orgId of orgIds) {
      const org = await this.getOrganization(orgId);
      if (org) orgs.push(org);
    }
    return orgs;
  }

  // --- Invitations ---
  public async getInvitation(invitationId: string): Promise<OrgInvitation | null> {
    const snap = await this.firestore.collection('invitations').doc(invitationId).get();
    if (!snap.exists) return null;
    return snap.data() as OrgInvitation;
  }

  public async getInvitationByToken(token: string): Promise<OrgInvitation | null> {
    const snap = await this.firestore.collection('invitations').where('token', '==', token).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as OrgInvitation;
  }

  public async listOrgInvitations(orgId: string): Promise<OrgInvitation[]> {
    const snap = await this.firestore.collection('invitations').where('orgId', '==', orgId).get();
    return snap.docs.map((d) => d.data() as OrgInvitation);
  }

  public async saveInvitation(invitation: OrgInvitation): Promise<OrgInvitation> {
    await this.firestore
      .collection('invitations')
      .doc(invitation.id)
      .set(this.sanitize(invitation), { merge: true });
    return invitation;
  }

  public async deleteInvitation(invitationId: string): Promise<boolean> {
    await this.firestore.collection('invitations').doc(invitationId).delete();
    return true;
  }

  // --- Support Tickets ---
  public async getSupportTicket(ticketId: string): Promise<SupportTicket | null> {
    const snap = await this.firestore.collection('supportTickets').doc(ticketId).get();
    if (!snap.exists) return null;
    return snap.data() as SupportTicket;
  }

  public async listSupportTickets(orgId: string): Promise<SupportTicket[]> {
    const snap = await this.firestore.collection('supportTickets').where('orgId', '==', orgId).get();
    return snap.docs.map((d) => d.data() as SupportTicket);
  }

  public async saveSupportTicket(ticket: SupportTicket): Promise<SupportTicket> {
    await this.firestore
      .collection('supportTickets')
      .doc(ticket.id)
      .set(this.sanitize(ticket), { merge: true });
    return ticket;
  }

  // --- Clusters ---
  public async getCluster(clusterId: string, orgId?: string): Promise<Cluster | null> {
    const snap = await this.firestore.collection('clusters').doc(clusterId).get();
    if (!snap.exists) return null;
    const cluster = snap.data() as Cluster;
    if (orgId && cluster.orgId !== orgId) return null;
    return cluster;
  }

  public async listClusters(orgId?: string): Promise<Cluster[]> {
    let query: Query<DocumentData> = this.firestore.collection('clusters');
    if (orgId) {
      query = query.where('orgId', '==', orgId);
    }
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as Cluster);
  }

  public async upsertCluster(cluster: Cluster): Promise<Cluster> {
    await this.firestore.collection('clusters').doc(cluster.id).set(this.sanitize(cluster), { merge: true });
    return cluster;
  }

  public async deleteCluster(clusterId: string, orgId: string): Promise<boolean> {
    const cluster = await this.getCluster(clusterId, orgId);
    if (!cluster) return false;

    const batch = this.firestore.batch();
    batch.delete(this.firestore.collection('clusters').doc(clusterId));
    batch.delete(this.firestore.collection('clusterResources').doc(clusterId));

    // Delete corresponding cluster tokens
    const tokens = await this.firestore.collection('clusterTokens').where('clusterId', '==', clusterId).get();
    for (const d of tokens.docs) {
      batch.delete(d.ref);
    }

    await batch.commit();
    return true;
  }

  // --- Cluster Tokens ---
  public async getClusterTokenByHash(tokenHash: string): Promise<ClusterTokenRecord | null> {
    const snap = await this.firestore.collection('clusterTokens').doc(tokenHash).get();
    if (!snap.exists) return null;
    return snap.data() as ClusterTokenRecord;
  }

  public async saveClusterToken(record: ClusterTokenRecord): Promise<void> {
    await this.firestore.collection('clusterTokens').doc(record.tokenHash).set(this.sanitize(record), { merge: true });
  }

  public async deleteClusterToken(tokenHash: string): Promise<boolean> {
    await this.firestore.collection('clusterTokens').doc(tokenHash).delete();
    return true;
  }

  // --- Cluster Resources ---
  public async getClusterResources(clusterId: string, orgId?: string): Promise<KubernetesResource[]> {
    const snap = await this.firestore.collection('clusterResources').doc(clusterId).get();
    if (!snap.exists) return [];
    const record = snap.data() as ClusterResourcesRecord;
    if (orgId && record.orgId !== orgId) return [];
    return record.resources || [];
  }

  public async saveClusterResources(clusterId: string, orgId: string, resources: KubernetesResource[]): Promise<void> {
    const payload: ClusterResourcesRecord = {
      clusterId,
      orgId,
      resources,
      updatedAt: Date.now()
    };
    await this.firestore.collection('clusterResources').doc(clusterId).set(this.sanitize(payload), { merge: true });
  }

  // --- Incidents ---
  public async getIncident(incidentId: string, orgId?: string): Promise<Incident | null> {
    const snap = await this.firestore.collection('incidents').doc(incidentId).get();
    if (!snap.exists) return null;
    const inc = snap.data() as Incident;
    if (orgId && inc.orgId !== orgId) return null;
    return inc;
  }

  public async listIncidents(orgId?: string, clusterId?: string): Promise<Incident[]> {
    let query: Query<DocumentData> = this.firestore.collection('incidents');
    if (orgId) query = query.where('orgId', '==', orgId);
    if (clusterId) query = query.where('clusterId', '==', clusterId);
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as Incident);
  }

  public async upsertIncident(incident: Incident): Promise<Incident> {
    await this.firestore.collection('incidents').doc(incident.id).set(this.sanitize(incident), { merge: true });
    return incident;
  }

  public async deleteIncident(incidentId: string, orgId: string): Promise<boolean> {
    const inc = await this.getIncident(incidentId, orgId);
    if (!inc) return false;

    const batch = this.firestore.batch();
    batch.delete(this.firestore.collection('incidents').doc(incidentId));
    batch.delete(this.firestore.collection('remediations').doc(incidentId));
    batch.delete(this.firestore.collection('aiAnalyses').doc(incidentId));

    // Delete notes and timeline events
    const notes = await this.firestore.collection('incidentNotes').where('incidentId', '==', incidentId).get();
    for (const d of notes.docs) batch.delete(d.ref);

    const timeline = await this.firestore.collection('incidentTimeline').where('incidentId', '==', incidentId).get();
    for (const d of timeline.docs) batch.delete(d.ref);

    await batch.commit();
    return true;
  }

  // --- Incident Timeline ---
  public async getIncidentTimeline(incidentId: string, _orgId?: string): Promise<TimelineEvent[]> {
    const snap = await this.firestore
      .collection('incidentTimeline')
      .where('incidentId', '==', incidentId)
      .get();

    const items = snap.docs.map((d) => d.data() as TimelineEvent);
    items.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return items;
  }

  public async addTimelineEvent(incidentId: string, event: TimelineEvent, orgId: string): Promise<TimelineEvent> {
    const docId = event.id || `${incidentId}_${event.timestamp}_${Math.random().toString(36).substring(2, 7)}`;
    const fullEvent: TimelineEvent = {
      ...event,
      id: docId
    };
    await this.firestore
      .collection('incidentTimeline')
      .doc(docId)
      .set(this.sanitize({ ...fullEvent, incidentId, orgId }), { merge: true });
    return fullEvent;
  }

  public async setIncidentTimeline(incidentId: string, events: TimelineEvent[], orgId: string): Promise<void> {
    const batch = this.firestore.batch();
    const existing = await this.firestore.collection('incidentTimeline').where('incidentId', '==', incidentId).get();
    for (const d of existing.docs) batch.delete(d.ref);

    for (const ev of events) {
      const docId = ev.id || `${incidentId}_${ev.timestamp}_${Math.random().toString(36).substring(2, 7)}`;
      batch.set(
        this.firestore.collection('incidentTimeline').doc(docId),
        this.sanitize({ ...ev, id: docId, incidentId, orgId })
      );
    }
    await batch.commit();
  }

  // --- Incident Notes ---
  public async getIncidentNotes(incidentId: string, _orgId?: string): Promise<IncidentNote[]> {
    const snap = await this.firestore
      .collection('incidentNotes')
      .where('incidentId', '==', incidentId)
      .get();
    const items = snap.docs.map((d) => d.data() as IncidentNote);
    items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return items;
  }

  public async addIncidentNote(incidentId: string, note: IncidentNote, orgId: string): Promise<IncidentNote> {
    await this.firestore
      .collection('incidentNotes')
      .doc(note.id)
      .set(this.sanitize({ ...note, incidentId, orgId }), { merge: true });
    return note;
  }

  public async deleteIncidentNote(_incidentId: string, noteId: string, _orgId: string): Promise<boolean> {
    await this.firestore.collection('incidentNotes').doc(noteId).delete();
    return true;
  }

  // --- Remediations ---
  public async getRemediation(incidentId: string, orgId?: string): Promise<StructuredRemediation | null> {
    const snap = await this.firestore.collection('remediations').doc(incidentId).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (orgId && data?.orgId !== orgId) return null;
    return data?.remediation as StructuredRemediation;
  }

  public async saveRemediation(incidentId: string, remediation: StructuredRemediation, orgId: string): Promise<void> {
    await this.firestore
      .collection('remediations')
      .doc(incidentId)
      .set(this.sanitize({ incidentId, orgId, remediation, updatedAt: Date.now() }), { merge: true });
  }

  // --- Remediation Actions ---
  public async getRemediationAction(actionId: string, orgId?: string): Promise<RemediationAction | null> {
    const snap = await this.firestore.collection('remediationActions').doc(actionId).get();
    if (!snap.exists) return null;
    const action = snap.data() as RemediationAction;
    if (orgId && action.orgId !== orgId) return null;
    return action;
  }

  public async listRemediationActions(orgId?: string, incidentId?: string): Promise<RemediationAction[]> {
    let query: Query<DocumentData> = this.firestore.collection('remediationActions');
    if (orgId) query = query.where('orgId', '==', orgId);
    if (incidentId) query = query.where('incidentId', '==', incidentId);
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as RemediationAction);
  }

  public async saveRemediationAction(action: RemediationAction): Promise<RemediationAction> {
    await this.firestore
      .collection('remediationActions')
      .doc(action.id)
      .set(this.sanitize(action), { merge: true });
    return action;
  }

  // --- AI Analyses ---
  public async getAIAnalysis(incidentId: string, orgId?: string): Promise<SkyOpsAIAnalysis | null> {
    const snap = await this.firestore.collection('aiAnalyses').doc(incidentId).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (orgId && data?.orgId !== orgId) return null;
    return data?.analysis as SkyOpsAIAnalysis;
  }

  public async saveAIAnalysis(incidentId: string, analysis: SkyOpsAIAnalysis, orgId: string): Promise<void> {
    await this.firestore
      .collection('aiAnalyses')
      .doc(incidentId)
      .set(this.sanitize({ incidentId, orgId, analysis, analyzedAt: Date.now() }), { merge: true });
  }

  // --- Policies ---
  public async getPolicy(policyId: string, orgId?: string): Promise<RemediationPolicy | null> {
    const snap = await this.firestore.collection('policies').doc(policyId).get();
    if (!snap.exists) return null;
    const pol = snap.data() as RemediationPolicy;
    if (orgId && pol.orgId !== orgId) return null;
    return pol;
  }

  public async listPolicies(orgId: string): Promise<RemediationPolicy[]> {
    const snap = await this.firestore.collection('policies').where('orgId', '==', orgId).get();
    return snap.docs.map((d) => d.data() as RemediationPolicy);
  }

  public async savePolicy(policy: RemediationPolicy): Promise<RemediationPolicy> {
    const docId = (policy as any).id || (policy.clusterId ? `${policy.orgId}_${policy.clusterId}` : policy.orgId);
    await this.firestore.collection('policies').doc(docId).set(this.sanitize(policy), { merge: true });
    return policy;
  }

  public async deletePolicy(policyId: string, orgId: string): Promise<boolean> {
    const pol = await this.getPolicy(policyId, orgId);
    if (!pol) return false;
    await this.firestore.collection('policies').doc(policyId).delete();
    return true;
  }

  // --- Audit Events ---
  public async recordAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    await this.firestore
      .collection('auditEvents')
      .doc(event.id)
      .set(this.sanitize(event), { merge: true });
    return event;
  }

  public async queryAuditEvents(filters: AuditQueryFilters): Promise<PaginatedResult<AuditEvent>> {
    let query: Query<DocumentData> = this.firestore
      .collection('auditEvents')
      .where('orgId', '==', filters.orgId);

    if (filters.actorId) query = query.where('actorId', '==', filters.actorId);
    if (filters.action) query = query.where('action', '==', filters.action);
    if (filters.resourceType) query = query.where('resourceType', '==', filters.resourceType);
    if (filters.resourceId) query = query.where('resourceId', '==', filters.resourceId);
    if (filters.result) query = query.where('result', '==', filters.result);

    const snap = await query.get();
    let list = snap.docs.map((d) => d.data() as AuditEvent);

    if (filters.fromTimestamp) list = list.filter((e) => e.timestamp >= filters.fromTimestamp!);
    if (filters.toTimestamp) list = list.filter((e) => e.timestamp <= filters.toTimestamp!);

    list.sort((a, b) => b.timestamp - a.timestamp);

    const total = list.length;
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 50));
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const items = list.slice(startIndex, startIndex + limit);

    return { items, total, page, totalPages, limit };
  }

  // --- Webhooks ---
  public async getWebhook(webhookId: string, orgId?: string): Promise<WebhookConfig | null> {
    const snap = await this.firestore.collection('webhooks').doc(webhookId).get();
    if (!snap.exists) return null;
    const wh = snap.data() as WebhookConfig;
    if (orgId && wh.orgId !== orgId) return null;
    return wh;
  }

  public async listWebhooks(orgId: string): Promise<WebhookConfig[]> {
    const snap = await this.firestore.collection('webhooks').where('orgId', '==', orgId).get();
    return snap.docs.map((d) => d.data() as WebhookConfig);
  }

  public async saveWebhook(webhook: WebhookConfig): Promise<WebhookConfig> {
    await this.firestore
      .collection('webhooks')
      .doc(webhook.id)
      .set(this.sanitize(webhook), { merge: true });
    return webhook;
  }

  public async deleteWebhook(webhookId: string, orgId: string): Promise<boolean> {
    const wh = await this.getWebhook(webhookId, orgId);
    if (!wh) return false;
    await this.firestore.collection('webhooks').doc(webhookId).delete();
    return true;
  }

  // --- Webhook Deliveries ---
  public async recordWebhookDelivery(delivery: WebhookDeliveryRecord): Promise<WebhookDeliveryRecord> {
    await this.firestore
      .collection('webhookDeliveries')
      .doc(delivery.id)
      .set(this.sanitize(delivery), { merge: true });
    return delivery;
  }

  public async listWebhookDeliveries(orgId: string, webhookId?: string, limit = 100): Promise<WebhookDeliveryRecord[]> {
    let query: Query<DocumentData> = this.firestore
      .collection('webhookDeliveries')
      .where('orgId', '==', orgId);

    if (webhookId) query = query.where('webhookId', '==', webhookId);

    const snap = await query.get();
    const list = snap.docs.map((d) => d.data() as WebhookDeliveryRecord);
    list.sort((a, b) => b.timestamp - a.timestamp);
    return list.slice(0, limit);
  }

  // --- Subscriptions & Invoices ---
  public async getSubscription(orgId: string): Promise<Subscription | null> {
    const snap = await this.firestore.collection('subscriptions').doc(orgId).get();
    if (!snap.exists) return null;
    return snap.data() as Subscription;
  }

  public async saveSubscription(subscription: Subscription): Promise<Subscription> {
    const orgId = subscription.organizationId || (subscription as any).orgId;
    await this.firestore
      .collection('subscriptions')
      .doc(orgId)
      .set(this.sanitize(subscription), { merge: true });
    return subscription;
  }

  public async getInvoice(invoiceId: string, orgId?: string): Promise<Invoice | null> {
    const snap = await this.firestore.collection('invoices').doc(invoiceId).get();
    if (!snap.exists) return null;
    const inv = snap.data() as Invoice;
    const invOrg = inv.organizationId || (inv as any).orgId;
    if (orgId && invOrg !== orgId) return null;
    return inv;
  }

  public async listInvoices(orgId: string): Promise<Invoice[]> {
    const snap = await this.firestore.collection('invoices').where('organizationId', '==', orgId).get();
    return snap.docs.map((d) => d.data() as Invoice);
  }

  public async saveInvoice(invoice: Invoice): Promise<Invoice> {
    await this.firestore
      .collection('invoices')
      .doc(invoice.id)
      .set(this.sanitize(invoice), { merge: true });
    return invoice;
  }

  // --- Usage Summaries ---
  public async getUsage(orgId: string, period: string): Promise<OrgUsageSummary | null> {
    const docId = `${orgId}_${period}`;
    const snap = await this.firestore.collection('usage').doc(docId).get();
    if (!snap.exists) return null;
    return snap.data() as OrgUsageSummary;
  }

  public async saveUsage(summary: OrgUsageSummary): Promise<void> {
    const docId = `${summary.orgId}_${summary.period}`;
    await this.firestore.collection('usage').doc(docId).set(this.sanitize(summary), { merge: true });
  }

  // --- Processed Webhook IDs ---
  public async isWebhookProcessed(webhookId: string): Promise<boolean> {
    const snap = await this.firestore.collection('processedWebhooks').doc(webhookId).get();
    return snap.exists;
  }

  public async markWebhookProcessed(webhookId: string): Promise<void> {
    await this.firestore
      .collection('processedWebhooks')
      .doc(webhookId)
      .set({ processedAt: Date.now() }, { merge: true });
  }
}
