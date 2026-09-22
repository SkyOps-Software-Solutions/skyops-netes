import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  setLogLevel,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  Firestore as FirebaseFirestoreInstance
} from 'firebase/firestore';

// Suppress Firestore internal gRPC cancellation logs
try {
  setLogLevel('silent');
} catch {}

if (typeof process !== 'undefined' && process.stderr && (process.stderr as any).write) {
  const originalStderrWrite = (process.stderr as any).write.bind(process.stderr);
  (process.stderr as any).write = (chunk: any, encoding?: any, callback?: any) => {
    const str = typeof chunk === 'string' ? chunk : chunk?.toString() || '';
    if (
      str.includes('Disconnecting idle stream. Timed out waiting for new targets') ||
      (str.includes('GrpcConnection') && (str.includes('CANCELLED') || str.includes('idle stream')))
    ) {
      if (typeof encoding === 'function') encoding();
      else if (typeof callback === 'function') callback();
      return true;
    }
    return originalStderrWrite(chunk, encoding, callback);
  };
}
import crypto from 'crypto';
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
  Invoice,
  StoredArtifact,
  StoredArtifactFilters,
  StoredArtifactLifecycleStatus,
  StorageUsageSummary
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
import { InMemoryStore } from './InMemoryStore';
import fallbackConfig from '../../firebase-applet-config.json';

class DocRefWrapper {
  private docRef: any;
  constructor(private db: any, private col: string, public id: string) {
    this.docRef = doc(db, col, id);
  }

  public async get(): Promise<{ exists: boolean; data: () => any }> {
    const snap = await getDoc(this.docRef);
    return {
      exists: snap.exists(),
      data: () => snap.data()
    };
  }

  public async set(data: any, options?: { merge?: boolean }): Promise<void> {
    await setDoc(this.docRef, data, options || {});
  }

  public async delete(): Promise<void> {
    await deleteDoc(this.docRef);
  }
}

class CollectionRefWrapper {
  constructor(
    private db: any,
    private name: string,
    private constraints: any[] = []
  ) {}

  public doc(id?: string): DocRefWrapper {
    const docId = id || crypto.randomUUID();
    return new DocRefWrapper(this.db, this.name, docId);
  }

  public where(field: string, op: any, val: any): CollectionRefWrapper {
    if (val === undefined) return this;
    return new CollectionRefWrapper(this.db, this.name, [
      ...this.constraints,
      where(field, op as any, val)
    ]);
  }

  public orderBy(field: string, direction?: 'asc' | 'desc'): CollectionRefWrapper {
    return new CollectionRefWrapper(this.db, this.name, [
      ...this.constraints,
      orderBy(field, direction || 'asc')
    ]);
  }

  public limit(n: number): CollectionRefWrapper {
    return new CollectionRefWrapper(this.db, this.name, [
      ...this.constraints,
      limit(n)
    ]);
  }

  public async get(): Promise<{
    empty: boolean;
    size: number;
    docs: Array<{ id: string; ref: { delete: () => Promise<void> }; data: () => any }>;
  }> {
    const col = collection(this.db, this.name);
    const q = this.constraints.length > 0 ? query(col, ...this.constraints) : col;
    const snap = await getDocs(q);
    return {
      empty: snap.empty,
      size: snap.size,
      docs: snap.docs.map((d) => ({
        id: d.id,
        ref: { delete: () => deleteDoc(doc(this.db, this.name, d.id)) },
        data: () => d.data()
      }))
    };
  }
}

class FirebaseClientWrapper {
  constructor(private db: any) {}

  public collection(name: string): CollectionRefWrapper {
    return new CollectionRefWrapper(this.db, name);
  }

  public batch(): any {
    const ops: Array<() => Promise<void>> = [];
    return {
      set(docRef: any, data: any, options?: any) {
        ops.push(() => docRef.set(data, options));
      },
      delete(docRef: any) {
        ops.push(() => docRef.delete());
      },
      async commit() {
        for (const op of ops) {
          await op();
        }
      }
    };
  }

  public async terminate(): Promise<void> {
    // No-op for client-side firestore in long-running container
  }
}

export interface FirestoreStoreConfig {
  projectId?: string;
  databaseId?: string;
  keyFilename?: string;
}

export class FirestoreStore implements IPersistenceStore {
  public readonly providerName = 'firestore';
  private firestore: any;
  private readonly projectId: string;
  private readonly databaseId: string;
  public connected: boolean = false;
  private fallbackStore: InMemoryStore = new InMemoryStore();

  constructor(config?: FirestoreStoreConfig) {
    this.projectId =
      config?.projectId ||
      process.env.SKYOPS_FIRESTORE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      fallbackConfig.projectId ||
      'skyops-a1143';

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

    const apps = getApps();
    const app =
      apps.length > 0
        ? apps[0]
        : initializeApp({
            projectId: this.projectId,
            apiKey:
              process.env.VITE_FIREBASE_API_KEY ||
              fallbackConfig.apiKey,
            authDomain:
              process.env.VITE_FIREBASE_AUTH_DOMAIN ||
              fallbackConfig.authDomain ||
              `${this.projectId}.firebaseapp.com`,
            storageBucket:
              process.env.VITE_FIREBASE_STORAGE_BUCKET ||
              fallbackConfig.storageBucket ||
              `${this.projectId}.firebasestorage.app`,
            appId:
              process.env.VITE_FIREBASE_APP_ID ||
              fallbackConfig.appId
          });

    const firestoreInstance =
      this.databaseId && this.databaseId !== '(default)'
        ? getFirestore(app, this.databaseId)
        : getFirestore(app);

    this.firestore = new FirebaseClientWrapper(firestoreInstance);
  }

  public getDatabaseId(): string {
    return this.databaseId;
  }

  public getProjectId(): string {
    return this.projectId;
  }

  public async init(): Promise<void> {
    await this.fallbackStore.init();
    // Probe database connectivity gracefully
    try {
      await this.firestore.collection('organizations').limit(1).get();
      this.connected = true;
      console.log(
        `[FirestoreStore] Connected to Firestore project="${this.projectId}", database="${this.databaseId}"`
      );
    } catch (err: any) {
      this.connected = false;
      const msg = `[FirestoreStore] Notice: Firestore connection unverified (project="${this.projectId}", database="${this.databaseId}"): ${err?.message || err}. Operating in resilient local persistence mode.`;
      console.warn(msg);
    }
  }

  public async close(): Promise<void> {
    try {
      await this.firestore.terminate();
    } catch {
      // Ignore termination errors
    }
    await this.fallbackStore.close();
  }

  public isHealthySync(): boolean {
    return this.connected;
  }

  public async isHealthy(): Promise<boolean> {
    if (!this.connected) return false;
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
    if (!this.connected) return this.fallbackStore.getUser(userId);
    try {
      const snap = await this.firestore.collection('users').doc(userId).get();
      if (!snap.exists) return this.fallbackStore.getUser(userId);
      return snap.data() as User;
    } catch (err: any) {
      console.warn(`[FirestoreStore] getUser fallback:`, err?.message || err);
      return this.fallbackStore.getUser(userId);
    }
  }

  public async upsertUser(user: User): Promise<User> {
    await this.fallbackStore.upsertUser(user);
    if (!this.connected) return user;
    try {
      const docRef = this.firestore.collection('users').doc(user.id);
      const existing = await docRef.get();
      const updated: User = {
        ...(existing.exists ? (existing.data() as User) : {}),
        ...user
      };
      await docRef.set(this.sanitize(updated), { merge: true });
      return updated;
    } catch (err: any) {
      console.warn(`[FirestoreStore] upsertUser fallback:`, err?.message || err);
      return user;
    }
  }

  public async listUsers(): Promise<User[]> {
    if (!this.connected) return this.fallbackStore.listUsers();
    try {
      const snap = await this.firestore.collection('users').get();
      const docs = snap.docs.map((d) => d.data() as User);
      return docs.length > 0 ? docs : this.fallbackStore.listUsers();
    } catch (err: any) {
      console.warn(`[FirestoreStore] listUsers fallback:`, err?.message || err);
      return this.fallbackStore.listUsers();
    }
  }

  // --- User Notification Settings ---
  public async getUserNotificationSettings(userId: string): Promise<UserNotificationSettings | null> {
    if (!this.connected) return this.fallbackStore.getUserNotificationSettings(userId);
    try {
      const snap = await this.firestore.collection('userNotificationSettings').doc(userId).get();
      if (!snap.exists) return this.fallbackStore.getUserNotificationSettings(userId);
      return snap.data() as UserNotificationSettings;
    } catch (err: any) {
      return this.fallbackStore.getUserNotificationSettings(userId);
    }
  }

  public async saveUserNotificationSettings(userId: string, settings: UserNotificationSettings): Promise<void> {
    await this.fallbackStore.saveUserNotificationSettings(userId, settings);
    if (!this.connected) return;
    try {
      await this.firestore
        .collection('userNotificationSettings')
        .doc(userId)
        .set(this.sanitize({ ...settings, updatedAt: Date.now() }), { merge: true });
    } catch (err: any) {
      console.warn(`[FirestoreStore] saveUserNotificationSettings fallback:`, err?.message || err);
    }
  }

  // --- Organizations ---
  public async getOrganization(orgId: string): Promise<Organization | null> {
    if (!this.connected) return this.fallbackStore.getOrganization(orgId);
    try {
      const snap = await this.firestore.collection('organizations').doc(orgId).get();
      if (!snap.exists) return this.fallbackStore.getOrganization(orgId);
      return snap.data() as Organization;
    } catch (err: any) {
      return this.fallbackStore.getOrganization(orgId);
    }
  }

  public async upsertOrganization(org: Organization): Promise<Organization> {
    await this.fallbackStore.upsertOrganization(org);
    if (!this.connected) return org;
    try {
      const docRef = this.firestore.collection('organizations').doc(org.id);
      const existing = await docRef.get();
      const updated: Organization = {
        ...(existing.exists ? (existing.data() as Organization) : {}),
        ...org,
        createdAt: existing.exists ? (existing.data() as Organization).createdAt : org.createdAt || Date.now()
      };
      await docRef.set(this.sanitize(updated), { merge: true });
      return updated;
    } catch (err: any) {
      console.warn(`[FirestoreStore] upsertOrganization fallback:`, err?.message || err);
      return org;
    }
  }

  public async listOrganizations(): Promise<Organization[]> {
    if (!this.connected) return this.fallbackStore.listOrganizations();
    try {
      const snap = await this.firestore.collection('organizations').get();
      const docs = snap.docs.map((d) => d.data() as Organization);
      return docs.length > 0 ? docs : this.fallbackStore.listOrganizations();
    } catch (err: any) {
      return this.fallbackStore.listOrganizations();
    }
  }

  public async deleteOrganization(orgId: string): Promise<boolean> {
    await this.fallbackStore.deleteOrganization(orgId);
    if (!this.connected) return true;
    try {
      const batch = this.firestore.batch();
      batch.delete(this.firestore.collection('organizations').doc(orgId));

      const membersSnap = await this.firestore.collection('memberships').where('orgId', '==', orgId).get();
      for (const d of membersSnap.docs) {
        batch.delete(d.ref);
      }
      await batch.commit();
      return true;
    } catch (err: any) {
      console.warn(`[FirestoreStore] deleteOrganization fallback:`, err?.message || err);
      return true;
    }
  }

  // --- Organization Memberships ---
  public async getOrgMembers(orgId: string): Promise<OrgMember[]> {
    if (!this.connected) return this.fallbackStore.getOrgMembers(orgId);
    try {
      const snap = await this.firestore.collection('memberships').where('orgId', '==', orgId).get();
      const docs = snap.docs.map((d) => d.data() as OrgMember);
      return docs.length > 0 ? docs : this.fallbackStore.getOrgMembers(orgId);
    } catch (err: any) {
      return this.fallbackStore.getOrgMembers(orgId);
    }
  }

  public async setOrgMembers(orgId: string, members: OrgMember[]): Promise<void> {
    await this.fallbackStore.setOrgMembers(orgId, members);
    if (!this.connected) return;
    try {
      const batch = this.firestore.batch();
      const existing = await this.firestore.collection('memberships').where('orgId', '==', orgId).get();
      for (const d of existing.docs) {
        batch.delete(d.ref);
      }
      for (const m of members) {
        const docId = `${orgId}_${m.userId}`;
        batch.set(this.firestore.collection('memberships').doc(docId), this.sanitize({ ...m, orgId }));
      }
      await batch.commit();
    } catch (err: any) {
      console.warn(`[FirestoreStore] setOrgMembers fallback:`, err?.message || err);
    }
  }

  public async addOrgMember(orgId: string, member: OrgMember): Promise<OrgMember> {
    await this.fallbackStore.addOrgMember(orgId, member);
    if (!this.connected) return member;
    try {
      const docId = `${orgId}_${member.userId}`;
      const payload = this.sanitize({ ...member, orgId });
      await this.firestore.collection('memberships').doc(docId).set(payload, { merge: true });
      return member;
    } catch (err: any) {
      return member;
    }
  }

  public async removeOrgMember(orgId: string, userId: string): Promise<boolean> {
    await this.fallbackStore.removeOrgMember(orgId, userId);
    if (!this.connected) return true;
    try {
      const docId = `${orgId}_${userId}`;
      await this.firestore.collection('memberships').doc(docId).delete();
      return true;
    } catch (err: any) {
      return true;
    }
  }

  public async getUserOrganizations(userId: string, email?: string): Promise<Organization[]> {
    if (!this.connected) return this.fallbackStore.getUserOrganizations(userId, email);
    try {
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
      return orgs.length > 0 ? orgs : this.fallbackStore.getUserOrganizations(userId, email);
    } catch (err: any) {
      return this.fallbackStore.getUserOrganizations(userId, email);
    }
  }

  // --- Invitations ---
  public async getInvitation(invitationId: string): Promise<OrgInvitation | null> {
    if (!this.connected) return this.fallbackStore.getInvitation(invitationId);
    try {
      const snap = await this.firestore.collection('invitations').doc(invitationId).get();
      if (!snap.exists) return this.fallbackStore.getInvitation(invitationId);
      return snap.data() as OrgInvitation;
    } catch (err: any) {
      return this.fallbackStore.getInvitation(invitationId);
    }
  }

  public async getInvitationByToken(token: string): Promise<OrgInvitation | null> {
    if (!this.connected) return this.fallbackStore.getInvitationByToken(token);
    try {
      const snap = await this.firestore.collection('invitations').where('token', '==', token).limit(1).get();
      if (snap.empty) return this.fallbackStore.getInvitationByToken(token);
      return snap.docs[0].data() as OrgInvitation;
    } catch (err: any) {
      return this.fallbackStore.getInvitationByToken(token);
    }
  }

  public async listOrgInvitations(orgId: string): Promise<OrgInvitation[]> {
    if (!this.connected) return this.fallbackStore.listOrgInvitations(orgId);
    try {
      const snap = await this.firestore.collection('invitations').where('orgId', '==', orgId).get();
      const docs = snap.docs.map((d) => d.data() as OrgInvitation);
      return docs.length > 0 ? docs : this.fallbackStore.listOrgInvitations(orgId);
    } catch (err: any) {
      return this.fallbackStore.listOrgInvitations(orgId);
    }
  }

  public async saveInvitation(invitation: OrgInvitation): Promise<OrgInvitation> {
    await this.fallbackStore.saveInvitation(invitation);
    if (!this.connected) return invitation;
    try {
      await this.firestore
        .collection('invitations')
        .doc(invitation.id)
        .set(this.sanitize(invitation), { merge: true });
      return invitation;
    } catch (err: any) {
      return invitation;
    }
  }

  public async deleteInvitation(invitationId: string): Promise<boolean> {
    await this.fallbackStore.deleteInvitation(invitationId);
    if (!this.connected) return true;
    try {
      await this.firestore.collection('invitations').doc(invitationId).delete();
      return true;
    } catch (err: any) {
      return true;
    }
  }

  // --- Support Tickets ---
  public async getSupportTicket(ticketId: string): Promise<SupportTicket | null> {
    if (!this.connected) return this.fallbackStore.getSupportTicket(ticketId);
    try {
      const snap = await this.firestore.collection('supportTickets').doc(ticketId).get();
      if (!snap.exists) return this.fallbackStore.getSupportTicket(ticketId);
      return snap.data() as SupportTicket;
    } catch (err: any) {
      return this.fallbackStore.getSupportTicket(ticketId);
    }
  }

  public async listSupportTickets(orgId: string): Promise<SupportTicket[]> {
    if (!this.connected) return this.fallbackStore.listSupportTickets(orgId);
    try {
      const snap = await this.firestore.collection('supportTickets').where('orgId', '==', orgId).get();
      const docs = snap.docs.map((d) => d.data() as SupportTicket);
      return docs.length > 0 ? docs : this.fallbackStore.listSupportTickets(orgId);
    } catch (err: any) {
      return this.fallbackStore.listSupportTickets(orgId);
    }
  }

  public async saveSupportTicket(ticket: SupportTicket): Promise<SupportTicket> {
    await this.fallbackStore.saveSupportTicket(ticket);
    if (!this.connected) return ticket;
    try {
      await this.firestore
        .collection('supportTickets')
        .doc(ticket.id)
        .set(this.sanitize(ticket), { merge: true });
      return ticket;
    } catch (err: any) {
      return ticket;
    }
  }

  // --- Clusters ---
  public async getCluster(clusterId: string, orgId?: string): Promise<Cluster | null> {
    if (!this.connected) return this.fallbackStore.getCluster(clusterId, orgId);
    try {
      const snap = await this.firestore.collection('clusters').doc(clusterId).get();
      if (!snap.exists) return this.fallbackStore.getCluster(clusterId, orgId);
      const cluster = snap.data() as Cluster;
      if (orgId && cluster.orgId !== orgId) return null;
      return cluster;
    } catch (err: any) {
      return this.fallbackStore.getCluster(clusterId, orgId);
    }
  }

  public async listClusters(orgId?: string): Promise<Cluster[]> {
    if (!this.connected) return this.fallbackStore.listClusters(orgId);
    try {
      let query: any = this.firestore.collection('clusters');
      if (orgId) {
        query = query.where('orgId', '==', orgId);
      }
      const snap = await query.get();
      const docs = snap.docs.map((d) => d.data() as Cluster);
      return docs.length > 0 ? docs : this.fallbackStore.listClusters(orgId);
    } catch (err: any) {
      return this.fallbackStore.listClusters(orgId);
    }
  }

  public async upsertCluster(cluster: Cluster): Promise<Cluster> {
    await this.fallbackStore.upsertCluster(cluster);
    if (!this.connected) return cluster;
    try {
      await this.firestore.collection('clusters').doc(cluster.id).set(this.sanitize(cluster), { merge: true });
      return cluster;
    } catch (err: any) {
      return cluster;
    }
  }

  public async deleteCluster(clusterId: string, orgId: string): Promise<boolean> {
    await this.fallbackStore.deleteCluster(clusterId, orgId);
    if (!this.connected) return true;
    try {
      const cluster = await this.getCluster(clusterId, orgId);
      if (!cluster) return false;

      const batch = this.firestore.batch();
      batch.delete(this.firestore.collection('clusters').doc(clusterId));
      batch.delete(this.firestore.collection('clusterResources').doc(clusterId));

      const tokens = await this.firestore.collection('clusterTokens').where('clusterId', '==', clusterId).get();
      for (const d of tokens.docs) {
        batch.delete(d.ref);
      }

      await batch.commit();
      return true;
    } catch (err: any) {
      return true;
    }
  }

  // --- Cluster Tokens ---
  public async getClusterTokenByHash(tokenHash: string): Promise<ClusterTokenRecord | null> {
    if (!this.connected) return this.fallbackStore.getClusterTokenByHash(tokenHash);
    try {
      const snap = await this.firestore.collection('clusterTokens').doc(tokenHash).get();
      if (!snap.exists) return this.fallbackStore.getClusterTokenByHash(tokenHash);
      return snap.data() as ClusterTokenRecord;
    } catch (err: any) {
      return this.fallbackStore.getClusterTokenByHash(tokenHash);
    }
  }

  public async saveClusterToken(record: ClusterTokenRecord): Promise<void> {
    await this.fallbackStore.saveClusterToken(record);
    if (!this.connected) return;
    try {
      await this.firestore.collection('clusterTokens').doc(record.tokenHash).set(this.sanitize(record), { merge: true });
    } catch (err: any) {
      // Ignored
    }
  }

  public async deleteClusterToken(tokenHash: string): Promise<boolean> {
    await this.fallbackStore.deleteClusterToken(tokenHash);
    if (!this.connected) return true;
    try {
      await this.firestore.collection('clusterTokens').doc(tokenHash).delete();
      return true;
    } catch (err: any) {
      return true;
    }
  }

  // --- Cluster Resources ---
  public async getClusterResources(clusterId: string, orgId?: string): Promise<KubernetesResource[]> {
    if (!this.connected) return this.fallbackStore.getClusterResources(clusterId, orgId);
    try {
      const snap = await this.firestore.collection('clusterResources').doc(clusterId).get();
      if (!snap.exists) return this.fallbackStore.getClusterResources(clusterId, orgId);
      const record = snap.data() as ClusterResourcesRecord;
      if (orgId && record.orgId !== orgId) return [];
      return record.resources || [];
    } catch (err: any) {
      return this.fallbackStore.getClusterResources(clusterId, orgId);
    }
  }

  public async saveClusterResources(clusterId: string, orgId: string, resources: KubernetesResource[]): Promise<void> {
    await this.fallbackStore.saveClusterResources(clusterId, orgId, resources);
    if (!this.connected) return;
    try {
      const payload: ClusterResourcesRecord = {
        clusterId,
        orgId,
        resources,
        updatedAt: Date.now()
      };
      await this.firestore.collection('clusterResources').doc(clusterId).set(this.sanitize(payload), { merge: true });
    } catch (err: any) {
      // Ignored
    }
  }

  // --- Incidents ---
  public async getIncident(incidentId: string, orgId?: string): Promise<Incident | null> {
    if (!this.connected) return this.fallbackStore.getIncident(incidentId, orgId);
    try {
      const snap = await this.firestore.collection('incidents').doc(incidentId).get();
      if (!snap.exists) return this.fallbackStore.getIncident(incidentId, orgId);
      const inc = snap.data() as Incident;
      if (orgId && inc.orgId !== orgId) return null;
      return inc;
    } catch (err: any) {
      return this.fallbackStore.getIncident(incidentId, orgId);
    }
  }

  public async listIncidents(orgId?: string, clusterId?: string): Promise<Incident[]> {
    if (!this.connected) return this.fallbackStore.listIncidents(orgId, clusterId);
    try {
      let query: any = this.firestore.collection('incidents');
      if (orgId) query = query.where('orgId', '==', orgId);
      if (clusterId) query = query.where('clusterId', '==', clusterId);
      const snap = await query.get();
      const docs = snap.docs.map((d) => d.data() as Incident);
      return docs.length > 0 ? docs : this.fallbackStore.listIncidents(orgId, clusterId);
    } catch (err: any) {
      return this.fallbackStore.listIncidents(orgId, clusterId);
    }
  }

  public async upsertIncident(incident: Incident): Promise<Incident> {
    await this.fallbackStore.upsertIncident(incident);
    if (!this.connected) return incident;
    try {
      await this.firestore.collection('incidents').doc(incident.id).set(this.sanitize(incident), { merge: true });
      return incident;
    } catch (err: any) {
      return incident;
    }
  }

  public async deleteIncident(incidentId: string, orgId: string): Promise<boolean> {
    await this.fallbackStore.deleteIncident(incidentId, orgId);
    if (!this.connected) return true;
    try {
      const inc = await this.getIncident(incidentId, orgId);
      if (!inc) return false;

      const batch = this.firestore.batch();
      batch.delete(this.firestore.collection('incidents').doc(incidentId));
      batch.delete(this.firestore.collection('remediations').doc(incidentId));
      batch.delete(this.firestore.collection('aiAnalyses').doc(incidentId));

      const notes = await this.firestore.collection('incidentNotes').where('incidentId', '==', incidentId).get();
      for (const d of notes.docs) batch.delete(d.ref);

      const timeline = await this.firestore.collection('incidentTimeline').where('incidentId', '==', incidentId).get();
      for (const d of timeline.docs) batch.delete(d.ref);

      await batch.commit();
      return true;
    } catch (err: any) {
      return true;
    }
  }

  // --- Incident Timeline ---
  public async getIncidentTimeline(incidentId: string, orgId?: string): Promise<TimelineEvent[]> {
    if (!this.connected) return this.fallbackStore.getIncidentTimeline(incidentId, orgId);
    try {
      const snap = await this.firestore
        .collection('incidentTimeline')
        .where('incidentId', '==', incidentId)
        .get();

      const items = snap.docs.map((d) => d.data() as TimelineEvent);
      items.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      return items.length > 0 ? items : this.fallbackStore.getIncidentTimeline(incidentId, orgId);
    } catch (err: any) {
      return this.fallbackStore.getIncidentTimeline(incidentId, orgId);
    }
  }

  public async addTimelineEvent(incidentId: string, event: TimelineEvent, orgId: string): Promise<TimelineEvent> {
    await this.fallbackStore.addTimelineEvent(incidentId, event, orgId);
    if (!this.connected) return event;
    try {
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
    } catch (err: any) {
      return event;
    }
  }

  public async setIncidentTimeline(incidentId: string, events: TimelineEvent[], orgId: string): Promise<void> {
    await this.fallbackStore.setIncidentTimeline(incidentId, events, orgId);
    if (!this.connected) return;
    try {
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
    } catch (err: any) {
      // Ignored
    }
  }

  // --- Incident Notes ---
  public async getIncidentNotes(incidentId: string, orgId?: string): Promise<IncidentNote[]> {
    if (!this.connected) return this.fallbackStore.getIncidentNotes(incidentId, orgId);
    try {
      const snap = await this.firestore
        .collection('incidentNotes')
        .where('incidentId', '==', incidentId)
        .get();
      const items = snap.docs.map((d) => d.data() as IncidentNote);
      items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      return items.length > 0 ? items : this.fallbackStore.getIncidentNotes(incidentId, orgId);
    } catch (err: any) {
      return this.fallbackStore.getIncidentNotes(incidentId, orgId);
    }
  }

  public async addIncidentNote(incidentId: string, note: IncidentNote, orgId: string): Promise<IncidentNote> {
    await this.fallbackStore.addIncidentNote(incidentId, note, orgId);
    if (!this.connected) return note;
    try {
      await this.firestore
        .collection('incidentNotes')
        .doc(note.id)
        .set(this.sanitize({ ...note, incidentId, orgId }), { merge: true });
      return note;
    } catch (err: any) {
      return note;
    }
  }

  public async deleteIncidentNote(incidentId: string, noteId: string, orgId: string): Promise<boolean> {
    await this.fallbackStore.deleteIncidentNote(incidentId, noteId, orgId);
    if (!this.connected) return true;
    try {
      await this.firestore.collection('incidentNotes').doc(noteId).delete();
      return true;
    } catch (err: any) {
      return true;
    }
  }

  // --- Remediations ---
  public async getRemediation(incidentId: string, orgId?: string): Promise<StructuredRemediation | null> {
    if (!this.connected) return this.fallbackStore.getRemediation(incidentId, orgId);
    try {
      const snap = await this.firestore.collection('remediations').doc(incidentId).get();
      if (!snap.exists) return this.fallbackStore.getRemediation(incidentId, orgId);
      const data = snap.data();
      if (orgId && data?.orgId !== orgId) return null;
      return data?.remediation as StructuredRemediation;
    } catch (err: any) {
      return this.fallbackStore.getRemediation(incidentId, orgId);
    }
  }

  public async saveRemediation(incidentId: string, remediation: StructuredRemediation, orgId: string): Promise<void> {
    await this.fallbackStore.saveRemediation(incidentId, remediation, orgId);
    if (!this.connected) return;
    try {
      await this.firestore
        .collection('remediations')
        .doc(incidentId)
        .set(this.sanitize({ incidentId, orgId, remediation, updatedAt: Date.now() }), { merge: true });
    } catch (err: any) {
      // Ignored
    }
  }

  // --- Remediation Actions ---
  public async getRemediationAction(actionId: string, orgId?: string): Promise<RemediationAction | null> {
    if (!this.connected) return this.fallbackStore.getRemediationAction(actionId, orgId);
    try {
      const snap = await this.firestore.collection('remediationActions').doc(actionId).get();
      if (!snap.exists) return this.fallbackStore.getRemediationAction(actionId, orgId);
      const action = snap.data() as RemediationAction;
      if (orgId && action.orgId !== orgId) return null;
      return action;
    } catch (err: any) {
      return this.fallbackStore.getRemediationAction(actionId, orgId);
    }
  }

  public async listRemediationActions(orgId?: string, incidentId?: string): Promise<RemediationAction[]> {
    if (!this.connected) return this.fallbackStore.listRemediationActions(orgId, incidentId);
    try {
      let query: any = this.firestore.collection('remediationActions');
      if (orgId) query = query.where('orgId', '==', orgId);
      if (incidentId) query = query.where('incidentId', '==', incidentId);
      const snap = await query.get();
      const docs = snap.docs.map((d) => d.data() as RemediationAction);
      return docs.length > 0 ? docs : this.fallbackStore.listRemediationActions(orgId, incidentId);
    } catch (err: any) {
      return this.fallbackStore.listRemediationActions(orgId, incidentId);
    }
  }

  public async saveRemediationAction(action: RemediationAction): Promise<RemediationAction> {
    await this.fallbackStore.saveRemediationAction(action);
    if (!this.connected) return action;
    try {
      await this.firestore
        .collection('remediationActions')
        .doc(action.id)
        .set(this.sanitize(action), { merge: true });
      return action;
    } catch (err: any) {
      return action;
    }
  }

  // --- AI Analyses ---
  public async getAIAnalysis(incidentId: string, orgId?: string): Promise<SkyOpsAIAnalysis | null> {
    if (!this.connected) return this.fallbackStore.getAIAnalysis(incidentId, orgId);
    try {
      const snap = await this.firestore.collection('aiAnalyses').doc(incidentId).get();
      if (!snap.exists) return this.fallbackStore.getAIAnalysis(incidentId, orgId);
      const data = snap.data();
      if (orgId && data?.orgId !== orgId) return null;
      return data?.analysis as SkyOpsAIAnalysis;
    } catch (err: any) {
      return this.fallbackStore.getAIAnalysis(incidentId, orgId);
    }
  }

  public async saveAIAnalysis(incidentId: string, analysis: SkyOpsAIAnalysis, orgId: string): Promise<void> {
    await this.fallbackStore.saveAIAnalysis(incidentId, analysis, orgId);
    if (!this.connected) return;
    try {
      await this.firestore
        .collection('aiAnalyses')
        .doc(incidentId)
        .set(this.sanitize({ incidentId, orgId, analysis, analyzedAt: Date.now() }), { merge: true });
    } catch (err: any) {
      // Ignored
    }
  }

  // --- Policies ---
  public async getPolicy(policyId: string, orgId?: string): Promise<RemediationPolicy | null> {
    if (!this.connected) return this.fallbackStore.getPolicy(policyId, orgId);
    try {
      const snap = await this.firestore.collection('policies').doc(policyId).get();
      if (!snap.exists) return this.fallbackStore.getPolicy(policyId, orgId);
      const pol = snap.data() as RemediationPolicy;
      if (orgId && pol.orgId !== orgId) return null;
      return pol;
    } catch (err: any) {
      return this.fallbackStore.getPolicy(policyId, orgId);
    }
  }

  public async listPolicies(orgId: string): Promise<RemediationPolicy[]> {
    if (!this.connected) return this.fallbackStore.listPolicies(orgId);
    try {
      const snap = await this.firestore.collection('policies').where('orgId', '==', orgId).get();
      const docs = snap.docs.map((d) => d.data() as RemediationPolicy);
      return docs.length > 0 ? docs : this.fallbackStore.listPolicies(orgId);
    } catch (err: any) {
      return this.fallbackStore.listPolicies(orgId);
    }
  }

  public async savePolicy(policy: RemediationPolicy): Promise<RemediationPolicy> {
    await this.fallbackStore.savePolicy(policy);
    if (!this.connected) return policy;
    try {
      const docId = (policy as any).id || (policy.clusterId ? `${policy.orgId}_${policy.clusterId}` : policy.orgId);
      await this.firestore.collection('policies').doc(docId).set(this.sanitize(policy), { merge: true });
      return policy;
    } catch (err: any) {
      return policy;
    }
  }

  public async deletePolicy(policyId: string, orgId: string): Promise<boolean> {
    await this.fallbackStore.deletePolicy(policyId, orgId);
    if (!this.connected) return true;
    try {
      const pol = await this.getPolicy(policyId, orgId);
      if (!pol) return false;
      await this.firestore.collection('policies').doc(policyId).delete();
      return true;
    } catch (err: any) {
      return true;
    }
  }

  // --- Audit Events ---
  public async recordAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    await this.fallbackStore.recordAuditEvent(event);
    if (!this.connected) return event;
    try {
      await this.firestore
        .collection('auditEvents')
        .doc(event.id)
        .set(this.sanitize(event), { merge: true });
      return event;
    } catch (err: any) {
      return event;
    }
  }

  public async queryAuditEvents(filters: AuditQueryFilters): Promise<PaginatedResult<AuditEvent>> {
    if (!this.connected) return this.fallbackStore.queryAuditEvents(filters);
    try {
      const snap = await this.firestore
        .collection('auditEvents')
        .where('orgId', '==', filters.orgId)
        .get();

      let list = snap.docs.map((d) => d.data() as AuditEvent);

      if (filters.actorId) list = list.filter((e) => e.actorId === filters.actorId);
      if (filters.actorType) {
        const targetType = filters.actorType.toUpperCase();
        list = list.filter((e) => {
          const itemType = (e.actorType || '').toUpperCase();
          if (targetType === 'USER' || targetType === 'HUMAN') {
            return itemType === 'USER' || itemType === 'HUMAN';
          }
          return itemType === targetType;
        });
      }
      if (filters.action) list = list.filter((e) => e.action.toLowerCase() === filters.action?.toLowerCase());
      if (filters.resourceType) list = list.filter((e) => e.resourceType.toUpperCase() === filters.resourceType?.toUpperCase());
      if (filters.resourceId) list = list.filter((e) => e.resourceId === filters.resourceId);
      if (filters.result) list = list.filter((e) => e.result === filters.result);
      if (filters.fromTimestamp) list = list.filter((e) => e.timestamp >= filters.fromTimestamp!);
      if (filters.toTimestamp) list = list.filter((e) => e.timestamp <= filters.toTimestamp!);
      if (filters.search) {
        const q = filters.search.toLowerCase();
        list = list.filter(
          (e) =>
            (e.action && e.action.toLowerCase().includes(q)) ||
            (e.actorName && e.actorName.toLowerCase().includes(q)) ||
            (e.actorId && e.actorId.toLowerCase().includes(q)) ||
            (e.resourceId && e.resourceId.toLowerCase().includes(q)) ||
            (e.resourceType && e.resourceType.toLowerCase().includes(q)) ||
            (e.details && JSON.stringify(e.details).toLowerCase().includes(q))
        );
      }

      list.sort((a, b) => b.timestamp - a.timestamp);

      const total = list.length;
      const page = Math.max(1, filters.page || 1);
      const limit = Math.max(1, Math.min(100, filters.limit || 50));
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const items = list.slice(startIndex, startIndex + limit);

      return { items, total, page, totalPages, limit };
    } catch (err: any) {
      console.warn('[FirestoreStore] queryAuditEvents error, using fallback:', err?.message || err);
      return this.fallbackStore.queryAuditEvents(filters);
    }
  }

  // --- Webhooks ---
  public async getWebhook(webhookId: string, orgId?: string): Promise<WebhookConfig | null> {
    if (!this.connected) return this.fallbackStore.getWebhook(webhookId, orgId);
    try {
      const snap = await this.firestore.collection('webhooks').doc(webhookId).get();
      if (!snap.exists) return this.fallbackStore.getWebhook(webhookId, orgId);
      const wh = snap.data() as WebhookConfig;
      if (orgId && wh.orgId !== orgId) return null;
      return wh;
    } catch (err: any) {
      return this.fallbackStore.getWebhook(webhookId, orgId);
    }
  }

  public async listWebhooks(orgId: string): Promise<WebhookConfig[]> {
    if (!this.connected) return this.fallbackStore.listWebhooks(orgId);
    try {
      const snap = await this.firestore.collection('webhooks').where('orgId', '==', orgId).get();
      const docs = snap.docs.map((d) => d.data() as WebhookConfig);
      return docs.length > 0 ? docs : this.fallbackStore.listWebhooks(orgId);
    } catch (err: any) {
      return this.fallbackStore.listWebhooks(orgId);
    }
  }

  public async saveWebhook(webhook: WebhookConfig): Promise<WebhookConfig> {
    await this.fallbackStore.saveWebhook(webhook);
    if (!this.connected) return webhook;
    try {
      await this.firestore
        .collection('webhooks')
        .doc(webhook.id)
        .set(this.sanitize(webhook), { merge: true });
      return webhook;
    } catch (err: any) {
      return webhook;
    }
  }

  public async deleteWebhook(webhookId: string, orgId: string): Promise<boolean> {
    await this.fallbackStore.deleteWebhook(webhookId, orgId);
    if (!this.connected) return true;
    try {
      const wh = await this.getWebhook(webhookId, orgId);
      if (!wh) return false;
      await this.firestore.collection('webhooks').doc(webhookId).delete();
      return true;
    } catch (err: any) {
      return true;
    }
  }

  // --- Webhook Deliveries ---
  public async recordWebhookDelivery(delivery: WebhookDeliveryRecord): Promise<WebhookDeliveryRecord> {
    await this.fallbackStore.recordWebhookDelivery(delivery);
    if (!this.connected) return delivery;
    try {
      await this.firestore
        .collection('webhookDeliveries')
        .doc(delivery.id)
        .set(this.sanitize(delivery), { merge: true });
      return delivery;
    } catch (err: any) {
      return delivery;
    }
  }

  public async listWebhookDeliveries(orgId: string, webhookId?: string, limit = 100): Promise<WebhookDeliveryRecord[]> {
    if (!this.connected) return this.fallbackStore.listWebhookDeliveries(orgId, webhookId, limit);
    try {
      let query: any = this.firestore
        .collection('webhookDeliveries')
        .where('orgId', '==', orgId);

      if (webhookId) query = query.where('webhookId', '==', webhookId);

      const snap = await query.get();
      const list = snap.docs.map((d) => d.data() as WebhookDeliveryRecord);
      list.sort((a, b) => b.timestamp - a.timestamp);
      return list.length > 0 ? list.slice(0, limit) : this.fallbackStore.listWebhookDeliveries(orgId, webhookId, limit);
    } catch (err: any) {
      return this.fallbackStore.listWebhookDeliveries(orgId, webhookId, limit);
    }
  }

  // --- Subscriptions & Invoices ---
  public async getSubscription(orgId: string): Promise<Subscription | null> {
    if (!this.connected) return this.fallbackStore.getSubscription(orgId);
    try {
      const snap = await this.firestore.collection('subscriptions').doc(orgId).get();
      if (!snap.exists) return this.fallbackStore.getSubscription(orgId);
      return snap.data() as Subscription;
    } catch (err: any) {
      return this.fallbackStore.getSubscription(orgId);
    }
  }

  public async saveSubscription(subscription: Subscription): Promise<Subscription> {
    await this.fallbackStore.saveSubscription(subscription);
    if (!this.connected) return subscription;
    try {
      const orgId = subscription.organizationId || (subscription as any).orgId;
      await this.firestore
        .collection('subscriptions')
        .doc(orgId)
        .set(this.sanitize(subscription), { merge: true });
      return subscription;
    } catch (err: any) {
      return subscription;
    }
  }

  public async getInvoice(invoiceId: string, orgId?: string): Promise<Invoice | null> {
    if (!this.connected) return this.fallbackStore.getInvoice(invoiceId, orgId);
    try {
      const snap = await this.firestore.collection('invoices').doc(invoiceId).get();
      if (!snap.exists) return this.fallbackStore.getInvoice(invoiceId, orgId);
      const inv = snap.data() as Invoice;
      const invOrg = inv.organizationId || (inv as any).orgId;
      if (orgId && invOrg !== orgId) return null;
      return inv;
    } catch (err: any) {
      return this.fallbackStore.getInvoice(invoiceId, orgId);
    }
  }

  public async listInvoices(orgId: string): Promise<Invoice[]> {
    if (!this.connected) return this.fallbackStore.listInvoices(orgId);
    try {
      const snap = await this.firestore.collection('invoices').where('organizationId', '==', orgId).get();
      const docs = snap.docs.map((d) => d.data() as Invoice);
      return docs.length > 0 ? docs : this.fallbackStore.listInvoices(orgId);
    } catch (err: any) {
      return this.fallbackStore.listInvoices(orgId);
    }
  }

  public async saveInvoice(invoice: Invoice): Promise<Invoice> {
    await this.fallbackStore.saveInvoice(invoice);
    if (!this.connected) return invoice;
    try {
      await this.firestore
        .collection('invoices')
        .doc(invoice.id)
        .set(this.sanitize(invoice), { merge: true });
      return invoice;
    } catch (err: any) {
      return invoice;
    }
  }

  // --- Usage Summaries ---
  public async getUsage(orgId: string, period: string): Promise<OrgUsageSummary | null> {
    if (!this.connected) return this.fallbackStore.getUsage(orgId, period);
    try {
      const docId = `${orgId}_${period}`;
      const snap = await this.firestore.collection('usage').doc(docId).get();
      if (!snap.exists) return this.fallbackStore.getUsage(orgId, period);
      return snap.data() as OrgUsageSummary;
    } catch (err: any) {
      return this.fallbackStore.getUsage(orgId, period);
    }
  }

  public async saveUsage(summary: OrgUsageSummary): Promise<void> {
    await this.fallbackStore.saveUsage(summary);
    if (!this.connected) return;
    try {
      const docId = `${summary.orgId}_${summary.period}`;
      await this.firestore.collection('usage').doc(docId).set(this.sanitize(summary), { merge: true });
    } catch (err: any) {
      // Ignored
    }
  }

  // --- Processed Webhook IDs ---
  public async isWebhookProcessed(webhookId: string): Promise<boolean> {
    if (!this.connected) return this.fallbackStore.isWebhookProcessed(webhookId);
    try {
      const snap = await this.firestore.collection('processedWebhooks').doc(webhookId).get();
      return snap.exists;
    } catch (err: any) {
      return this.fallbackStore.isWebhookProcessed(webhookId);
    }
  }

  public async markWebhookProcessed(webhookId: string): Promise<void> {
    await this.fallbackStore.markWebhookProcessed(webhookId);
    if (!this.connected) return;
    try {
      await this.firestore
        .collection('processedWebhooks')
        .doc(webhookId)
        .set({ processedAt: Date.now() }, { merge: true });
    } catch (err: any) {
      // Ignored
    }
  }

  // --- Stored Artifacts ---
  public async saveStoredArtifact(artifact: StoredArtifact): Promise<StoredArtifact> {
    await this.fallbackStore.saveStoredArtifact(artifact);
    if (!this.connected) return artifact;
    try {
      await this.firestore
        .collection('storedArtifacts')
        .doc(artifact.id)
        .set(this.sanitize(artifact), { merge: true });
      return artifact;
    } catch (err: any) {
      return artifact;
    }
  }

  public async getStoredArtifact(orgId: string, id: string): Promise<StoredArtifact | null> {
    if (!this.connected) return this.fallbackStore.getStoredArtifact(orgId, id);
    try {
      const snap = await this.firestore.collection('storedArtifacts').doc(id).get();
      if (!snap.exists) return null;
      const data = snap.data() as StoredArtifact;
      if (data.orgId !== orgId) return null;
      return data;
    } catch (err: any) {
      return this.fallbackStore.getStoredArtifact(orgId, id);
    }
  }

  public async listStoredArtifacts(
    orgId: string,
    filters?: StoredArtifactFilters
  ): Promise<PaginatedResult<StoredArtifact>> {
    if (!this.connected) return this.fallbackStore.listStoredArtifacts(orgId, filters);
    try {
      let query: any = this.firestore
        .collection('storedArtifacts')
        .where('orgId', '==', orgId);

      if (filters?.category) {
        query = query.where('category', '==', filters.category);
      }
      if (filters?.lifecycleStatus) {
        query = query.where('lifecycleStatus', '==', filters.lifecycleStatus);
      }

      const snap = await query.get();
      let list = snap.docs.map((d) => d.data() as StoredArtifact);

      if (filters?.fromTimestamp) {
        list = list.filter((a) => a.createdAt >= filters.fromTimestamp!);
      }
      if (filters?.toTimestamp) {
        list = list.filter((a) => a.createdAt <= filters.toTimestamp!);
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        list = list.filter(
          (a) =>
            a.filename.toLowerCase().includes(q) ||
            a.storagePath.toLowerCase().includes(q) ||
            (a.tags && a.tags.some((t) => t.toLowerCase().includes(q)))
        );
      }

      list.sort((a, b) => b.createdAt - a.createdAt);

      const total = list.length;
      const offset = filters?.offset || 0;
      const limit = filters?.limit || 50;
      const items = list.slice(offset, offset + limit);

      return {
        items,
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (err: any) {
      return this.fallbackStore.listStoredArtifacts(orgId, filters);
    }
  }

  public async updateStoredArtifactStatus(
    orgId: string,
    id: string,
    status: StoredArtifactLifecycleStatus
  ): Promise<StoredArtifact | null> {
    await this.fallbackStore.updateStoredArtifactStatus(orgId, id, status);
    if (!this.connected) return this.fallbackStore.getStoredArtifact(orgId, id);
    try {
      const docRef = this.firestore.collection('storedArtifacts').doc(id);
      const snap = await docRef.get();
      if (!snap.exists) return null;
      const data = snap.data() as StoredArtifact;
      if (data.orgId !== orgId) return null;

      const updated: Partial<StoredArtifact> = {
        lifecycleStatus: status,
        updatedAt: Date.now()
      };
      await docRef.update(updated);
      return { ...data, ...updated };
    } catch (err: any) {
      return this.fallbackStore.updateStoredArtifactStatus(orgId, id, status);
    }
  }

  public async deleteStoredArtifact(orgId: string, id: string): Promise<boolean> {
    await this.fallbackStore.deleteStoredArtifact(orgId, id);
    if (!this.connected) return true;
    try {
      const docRef = this.firestore.collection('storedArtifacts').doc(id);
      const snap = await docRef.get();
      if (!snap.exists) return false;
      const data = snap.data() as StoredArtifact;
      if (data.orgId !== orgId) return false;
      await docRef.delete();
      return true;
    } catch (err: any) {
      return this.fallbackStore.deleteStoredArtifact(orgId, id);
    }
  }

  public async getStorageUsageSummary(orgId: string): Promise<StorageUsageSummary> {
    if (!this.connected) return this.fallbackStore.getStorageUsageSummary(orgId);
    try {
      const snap = await this.firestore
        .collection('storedArtifacts')
        .where('orgId', '==', orgId)
        .get();

      const artifacts = snap.docs
        .map((d) => d.data() as StoredArtifact)
        .filter((a) => a.lifecycleStatus !== 'DELETED');

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

      for (const art of artifacts) {
        totalSizeBytes += art.sizeBytes;
        totalArtifactsCount += 1;
        if (categoryBreakdown[art.category]) {
          categoryBreakdown[art.category].sizeBytes += art.sizeBytes;
          categoryBreakdown[art.category].count += 1;
        }
      }

      return {
        orgId,
        totalSizeBytes,
        totalArtifactsCount,
        categoryBreakdown,
        lastUpdatedAt: Date.now()
      };
    } catch (err: any) {
      return this.fallbackStore.getStorageUsageSummary(orgId);
    }
  }
}
