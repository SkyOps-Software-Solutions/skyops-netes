import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile
} from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { auth, googleProvider, resolvedFirebaseConfig } from '../firebase';
import { Organization, OrgInvitation, OrgMember, Role, User } from '../types/index';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  currentOrg: Organization | null;
  organizations: Organization[];
  role: Role;
  members: OrgMember[];
  pendingInvitations: OrgInvitation[];
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  signInWithGoogle: (orgName?: string) => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, orgName: string, displayName?: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<void>;
  createOrganization: (name: string) => Promise<Organization>;
  refreshSession: () => Promise<void>;
  refreshPendingInvitations: () => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  declineInvitation: (invitationId: string) => Promise<void>;
  canManageClusters: boolean;
  canEditIncidents: boolean;
  canDeleteClusters: boolean;
  canApproveRemediations: boolean;
  canHeal: boolean;
  canModifyAutoHealing: boolean;
  canModifySecurityPolicy: boolean;
  canViewCost: boolean;
  canApplyCostOptimization: boolean;
  canManageTeam: boolean;
  canManageOrgSettings: boolean;
  canViewAuditLogs: boolean;
  isViewer: boolean;
  isAuditor: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<OrgInvitation[]>([]);
  const [role, setRole] = useState<Role>('OWNER');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const syncUserWithFirestore = async (
    fbUser: FirebaseUser,
    options?: {
      displayName?: string;
      organisationName?: string;
      role?: Role;
    }
  ) => {
    void fbUser;
    void options;
  };

  const refreshPendingInvitations = async () => {
    try {
      const invites = await api.getMyInvitations();
      setPendingInvitations(invites || []);
    } catch {
      // Gracefully catch background invitation lookup
    }
  };

  const refreshSession = async () => {
    try {
      setError(null);
      const session = await api.getSession();
      if (session && session.user) {
        setUser(session.user);
        setCurrentOrg(session.currentOrg || null);
        setOrganizations(session.organizations || []);
        setMembers(session.members || []);
        setRole(session.role || 'OWNER');
      }
      await refreshPendingInvitations();
    } catch (err: any) {
      console.warn('Session refresh notice:', err?.message || err);
      if (err?.status === 403 || err?.code === 'ORG_ACCESS_DENIED') {
        localStorage.removeItem('skyops_active_org_id');
        try {
          const retrySession = await api.getSession();
          if (retrySession && retrySession.user) {
            setUser(retrySession.user);
            setCurrentOrg(retrySession.currentOrg || null);
            setOrganizations(retrySession.organizations || []);
            setMembers(retrySession.members || []);
            setRole(retrySession.role || 'OWNER');
          }
        } catch {
          // Keep current state
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.info('[SkyOps AuthContext] Initializing Firebase runtime environment:', {
      projectId: resolvedFirebaseConfig.projectId,
      firestoreDatabaseId: resolvedFirebaseConfig.firestoreDatabaseId || '(default)',
      authDomain: resolvedFirebaseConfig.authDomain,
      envProjectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID,
      envDatabaseId: (import.meta as any).env?.VITE_FIREBASE_FIRESTORE_DATABASE_ID
    });

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await syncUserWithFirestore(fbUser);
        await refreshSession();
      } else {
        setUser(null);
        setCurrentOrg(null);
        setOrganizations([]);
        setMembers([]);
        setRole('VIEWER');
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async (orgName?: string) => {
    try {
      setError(null);
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        await syncUserWithFirestore(result.user, {
          displayName: result.user.displayName || undefined,
          organisationName: orgName?.trim() || undefined,
          role: 'OWNER'
        });
        await refreshSession();

        if (orgName && orgName.trim()) {
          try {
            await createOrganization(orgName.trim());
          } catch (orgErr) {
            console.warn('Organization auto-creation notice:', orgErr);
          }
        }
      }
    } catch (err: any) {
      let friendlyMessage = err.message || 'Failed to sign in with Google';
      if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized-domain')) {
        console.warn('[Firebase Auth] Notice: Domain not in Authorized Domains list yet. Work Email authentication is active.', err?.message);
        friendlyMessage =
          'UNAUTHORIZED_DOMAIN: This app domain is not yet authorized in Firebase Console for Google OAuth. Please authorize this domain in Firebase Authentication Settings or sign up/in below using Work Email & Password.';
      } else if (err.code === 'auth/popup-closed-by-user') {
        console.info('[Firebase Auth] Popup closed by user.');
        friendlyMessage = 'Google Sign-In popup was closed before completing authentication.';
      } else if (err.code === 'auth/popup-blocked') {
        friendlyMessage = 'Popup was blocked by your browser. Please allow popups or use Email/Password sign-in.';
      } else if (err.message?.includes('Pending promise was never set') || err.message?.includes('INTERNAL ASSERTION FAILED')) {
        console.warn('[Firebase Auth] Handled popup promise race condition.');
        if (auth.currentUser) {
          await syncUserWithFirestore(auth.currentUser);
          await refreshSession();
          return;
        }
        friendlyMessage = 'Google Sign-In was interrupted by browser popup policy. Please use Email & Password sign-in.';
      } else {
        console.error('Google Sign In failed:', err);
      }
      setError(friendlyMessage);
      throw new Error(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    try {
      setError(null);
      setLoading(true);
      try {
        const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
        if (result.user) {
          await syncUserWithFirestore(result.user);
          await refreshSession();
          return;
        }
      } catch (fbErr: any) {
        if (
          fbErr?.code === 'auth/operation-not-allowed' ||
          fbErr?.message?.includes('operation-not-allowed') ||
          fbErr?.message?.includes('auth/operation-not-allowed')
        ) {
          throw new Error('Email/Password sign-in is not enabled in the Firebase project console. Please sign in with Google or enable Email/Password provider in the Firebase Authentication console.');
        }
        throw fbErr;
      }
    } catch (err: any) {
      console.error('Email Sign In failed:', err);
      let friendlyMessage = err.message || 'Failed to sign in with email';
      if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        friendlyMessage = 'Invalid email or password. Check your credentials or create a new account.';
      } else if (err.code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      }
      setError(friendlyMessage);
      throw new Error(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, pass: string, orgName: string, displayName?: string) => {
    try {
      setError(null);
      setLoading(true);
      try {
        const result = await createUserWithEmailAndPassword(auth, email.trim(), pass);
        if (result.user) {
          const name = displayName?.trim() || email.split('@')[0];
          try {
            await updateProfile(result.user, { displayName: name });
          } catch {
            // ignore non-fatal profile update error
          }
          await syncUserWithFirestore(result.user, {
            displayName: name,
            organisationName: orgName.trim(),
            role: 'OWNER'
          });
          await refreshSession();

          // Create the user's initial organization
          if (orgName && orgName.trim()) {
            try {
              await createOrganization(orgName.trim());
            } catch (orgErr) {
              console.warn('Initial organization creation notice:', orgErr);
            }
          }
          return;
        }
      } catch (fbErr: any) {
        if (
          fbErr?.code === 'auth/operation-not-allowed' ||
          fbErr?.message?.includes('operation-not-allowed') ||
          fbErr?.message?.includes('auth/operation-not-allowed')
        ) {
          throw new Error('Email/Password account creation is not enabled in the Firebase project console. Please sign in with Google or enable Email/Password provider in the Firebase Authentication console.');
        }
        throw fbErr;
      }
    } catch (err: any) {
      console.error('Email Sign Up failed:', err);
      let friendlyMessage = err.message || 'Failed to create account';
      if (err.code === 'auth/email-already-in-use') {
        friendlyMessage = 'An account with this email already exists. Please sign in instead.';
      } else if (err.code === 'auth/weak-password') {
        friendlyMessage = 'Password is too weak. Please use at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      }
      setError(friendlyMessage);
      throw new Error(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err: any) {
      console.error('Password reset failed:', err);
      setError(err.message || 'Failed to send password reset email');
      throw err;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.warn('Firebase sign out warning:', err);
    } finally {
      localStorage.removeItem('skyops_active_org_id');
      setUser(null);
      setFirebaseUser(null);
      setCurrentOrg(null);
      setOrganizations([]);
      setMembers([]);
      setRole('VIEWER');
    }
  };

  const switchOrganization = async (orgId: string) => {
    localStorage.setItem('skyops_active_org_id', orgId);
    await refreshSession();
  };

  const createOrganization = async (name: string): Promise<Organization> => {
    const newOrg = await api.createOrganization(name);
    await switchOrganization(newOrg.id);
    return newOrg;
  };

  const acceptInvitation = async (invitationId: string) => {
    const res = await api.acceptMyInvitation(invitationId);
    if (res.organization?.id) {
      localStorage.setItem('skyops_active_org_id', res.organization.id);
    }
    await refreshSession();
    await refreshPendingInvitations();
  };

  const declineInvitation = async (invitationId: string) => {
    await api.declineMyInvitation(invitationId);
    setPendingInvitations((prev) => prev.filter((i) => i.id !== invitationId));
  };

  const isAuthenticated = !!firebaseUser || !!user;
  const canManageClusters = role === 'OWNER' || role === 'ADMIN' || role === 'SRE' || role === 'OPERATOR';
  const canDeleteClusters = role === 'OWNER' || role === 'ADMIN';
  const canEditIncidents = role === 'OWNER' || role === 'ADMIN' || role === 'SRE' || role === 'OPERATOR' || role === 'DEVELOPER' || role === 'ENGINEER';
  const canHeal = role === 'OWNER' || role === 'ADMIN' || role === 'SRE' || role === 'OPERATOR' || role === 'DEVELOPER' || role === 'ENGINEER';
  const canApproveRemediations = role === 'OWNER' || role === 'ADMIN' || role === 'SRE' || role === 'OPERATOR';
  const canModifyAutoHealing = role === 'OWNER' || role === 'ADMIN' || role === 'SRE' || role === 'OPERATOR';
  const canModifySecurityPolicy = role === 'OWNER' || role === 'ADMIN' || role === 'SRE' || role === 'OPERATOR';
  const canViewCost = true;
  const canApplyCostOptimization = role === 'OWNER' || role === 'ADMIN' || role === 'SRE' || role === 'OPERATOR';
  const canManageTeam = role === 'OWNER' || role === 'ADMIN';
  const canManageOrgSettings = role === 'OWNER' || role === 'ADMIN';
  const canViewAuditLogs = true;
  const isViewer = role === 'VIEWER';
  const isAuditor = role === 'AUDITOR';

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        currentOrg,
        organizations,
        role,
        members,
        pendingInvitations,
        loading,
        error,
        isAuthenticated,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        signOut,
        switchOrganization,
        createOrganization,
        refreshSession,
        refreshPendingInvitations,
        acceptInvitation,
        declineInvitation,
        canManageClusters,
        canEditIncidents,
        canDeleteClusters,
        canApproveRemediations,
        canHeal,
        canModifyAutoHealing,
        canModifySecurityPolicy,
        canViewCost,
        canApplyCostOptimization,
        canManageTeam,
        canManageOrgSettings,
        canViewAuditLogs,
        isViewer,
        isAuditor
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
