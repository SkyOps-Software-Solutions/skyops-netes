import { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { store } from '../store';
import { AuthenticatedUser, AuthenticatedUserRequest, requireUserAuth } from '../auth';
import { auditService } from '../audit';
import { Role } from '../../src/types/index';
import { isProduction } from '../config';

const BCRYPT_SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '24h';
const COOKIE_NAME = 'skyops_session';

// Stable or generated JWT secret (persists in process or env)
let cachedJwtSecret: string | null = null;
export function getLocalJwtSecret(): string {
  if (process.env.SKYOPS_JWT_SECRET) {
    return process.env.SKYOPS_JWT_SECRET;
  }
  if (!cachedJwtSecret) {
    cachedJwtSecret = crypto.randomBytes(32).toString('hex');
    if (isProduction && process.env.AUTH_PROVIDER === 'local') {
      console.warn('[LocalAuth] Notice: SKYOPS_JWT_SECRET not set in environment. Using in-memory ephemeral secret.');
    }
  }
  return cachedJwtSecret;
}

// In-Memory Rate Limiter for brute-force protection
interface RateLimitRecord {
  attempts: number;
  lockedUntil?: number;
}
const loginRateLimitMap = new Map<string, RateLimitRecord>();

export function checkLoginRateLimit(identifier: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const record = loginRateLimitMap.get(identifier);
  if (!record) return { allowed: true };

  if (record.lockedUntil && record.lockedUntil > now) {
    const waitSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  // Expired lock
  if (record.lockedUntil && record.lockedUntil <= now) {
    loginRateLimitMap.delete(identifier);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordFailedLogin(identifier: string): void {
  const now = Date.now();
  const record = loginRateLimitMap.get(identifier) || { attempts: 0 };
  record.attempts += 1;

  // Exponential lockout: 5 attempts = 1 min, 10 attempts = 15 mins
  if (record.attempts >= 10) {
    record.lockedUntil = now + 15 * 60 * 1000;
  } else if (record.attempts >= 5) {
    record.lockedUntil = now + 60 * 1000;
  }

  loginRateLimitMap.set(identifier, record);
}

export function resetLoginRateLimit(identifier: string): void {
  loginRateLimitMap.delete(identifier);
}

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

export function generateLocalJwt(user: { id: string; email: string; name: string; role?: Role }): string {
  const secret = getLocalJwtSecret();
  return jwt.sign(
    {
      sub: user.id,
      user_id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'OWNER',
      iss: 'skyops-self-hosted',
      aud: 'skyops-control-plane'
    },
    secret,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyLocalJwtToken(rawToken: string): AuthenticatedUser {
  const secret = getLocalJwtSecret();
  try {
    const decoded = jwt.verify(rawToken, secret, {
      algorithms: ['HS256'],
      issuer: 'skyops-self-hosted'
    }) as any;

    return {
      id: decoded.sub || decoded.user_id,
      email: decoded.email,
      name: decoded.name || decoded.email.split('@')[0],
      emailVerified: true,
      role: decoded.role as Role
    };
  } catch (err: any) {
    throw new Error(`Invalid local authentication token: ${err.message}`);
  }
}

/**
 * Checks whether initial administrator setup is required.
 * Returns true if no users exist in the persistence store.
 */
export async function isInitialSetupRequired(): Promise<boolean> {
  try {
    const persistence = store.getPersistence();
    if (typeof persistence.countAdmins === 'function') {
      const adminCount = await persistence.countAdmins();
      if (adminCount > 0) return false;
    }
    if (typeof persistence.countUsers === 'function') {
      const userCount = await persistence.countUsers();
      return userCount === 0;
    }
    const allUsers = await persistence.listUsers();
    return allUsers.length === 0;
  } catch (err) {
    console.warn('[LocalAuth] Notice: Error checking user count for setup wizard:', err);
    return false;
  }
}

/**
 * Attaches secure HTTP-only cookie with session JWT.
 */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });
}

/**
 * Clears session cookie on logout.
 */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax'
  });
}

export function isLocalAuthMode(): boolean {
  const authProvider = process.env.AUTH_PROVIDER?.toLowerCase();
  const deploymentMode = process.env.SKYOPS_DEPLOYMENT_MODE?.toLowerCase();
  return authProvider === 'local' || deploymentMode === 'self_hosted';
}

export const localAuthRouter = Router();

/**
 * GET /api/v1/auth/status
 * Informs client whether server is operating in self-hosted or cloud mode,
 * and if initial administrator setup is required.
 */
localAuthRouter.get('/status', async (_req: Request, res: Response) => {
  const isLocal = isLocalAuthMode();
  let setupRequired = false;
  if (isLocal) {
    setupRequired = await isInitialSetupRequired();
  }

  res.json({
    authProvider: isLocal ? 'local' : 'firebase',
    deploymentMode: process.env.SKYOPS_DEPLOYMENT_MODE || (isLocal ? 'self_hosted' : 'cloud'),
    setupRequired,
    initialized: !setupRequired
  });
});

/**
 * POST /api/v1/auth/setup
 * First-run administrator creation. Only allowed once when 0 users exist.
 */
localAuthRouter.post('/setup', async (req: Request, res: Response) => {
  if (!isLocalAuthMode()) {
    return res.status(400).json({ error: 'Local administrator setup is only available in self-hosted mode.' });
  }

  const setupRequired = await isInitialSetupRequired();
  if (!setupRequired) {
    return res.status(403).json({
      error: 'Forbidden: Initial administrator setup has already been completed.',
      code: 'SETUP_ALREADY_COMPLETED'
    });
  }

  const { name, email, password, organizationName } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters in length.' });
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Administrator full name is required.' });
  }

  const sanitizedEmail = email.toLowerCase().trim();
  const sanitizedName = name.trim();
  const sanitizedOrgName = (organizationName && typeof organizationName === 'string' && organizationName.trim()) || 'Default Workspace';

  const userId = `usr-admin-${Date.now()}`;
  const orgId = `org-${Date.now()}`;
  const passwordHash = await hashPassword(password);

  try {
    const persistence = store.getPersistence();

    // 1. Create user
    const user = await persistence.upsertUser({
      id: userId,
      email: sanitizedEmail,
      name: sanitizedName
    });

    // 2. Save credentials
    if (typeof persistence.saveLocalCredential === 'function') {
      await persistence.saveLocalCredential(userId, passwordHash, 'bcrypt');
    }

    // 3. Create initial organization
    const org = await persistence.upsertOrganization({
      id: orgId,
      name: sanitizedOrgName,
      slug: sanitizedOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `org-${Date.now()}`,
      ownerUserId: userId,
      membersCount: 1,
      createdAt: Date.now(),
      settings: {}
    });

    // 4. Assign OWNER membership
    await persistence.addOrgMember(orgId, {
      id: `mem-${userId}-${orgId}`,
      orgId,
      userId,
      email: sanitizedEmail,
      name: sanitizedName,
      role: 'OWNER',
      status: 'ACTIVE',
      joinedAt: Date.now()
    });

    // Also sync in-memory store
    store.upsertUser(user);
    if (typeof (store as any).upsertOrganization === 'function') {
      (store as any).upsertOrganization(org);
    }
    if (typeof (store as any).addOrgMember === 'function') {
      (store as any).addOrgMember(orgId, {
        id: `mem-${userId}-${orgId}`,
        orgId,
        userId,
        email: sanitizedEmail,
        name: sanitizedName,
        role: 'OWNER',
        status: 'ACTIVE',
        joinedAt: Date.now()
      });
    }

    // Generate session JWT
    const token = generateLocalJwt({
      id: userId,
      email: sanitizedEmail,
      name: sanitizedName,
      role: 'OWNER'
    });

    setSessionCookie(res, token);

    // Audit initial setup
    auditService.record({
      orgId,
      actorId: userId,
      actorName: sanitizedName,
      actorType: 'USER',
      action: 'auth.initial_setup',
      resourceType: 'ORGANIZATION',
      resourceId: orgId,
      result: 'SUCCESS',
      details: { email: sanitizedEmail, orgId, orgName: sanitizedOrgName },
      ipAddress: req.ip
    });

    console.log(`[LocalAuth] Initial administrator setup completed: ${sanitizedEmail} (org=${orgId})`);

    return res.status(201).json({
      message: 'Initial administrator setup completed successfully.',
      token,
      user,
      currentOrg: org,
      role: 'OWNER'
    });
  } catch (err: any) {
    console.error('[LocalAuth] Error executing setup wizard:', err);
    return res.status(500).json({ error: `Setup failed: ${err?.message || err}` });
  }
});

/**
 * POST /api/v1/auth/login
 * Local username & password authentication with rate limiting.
 */
localAuthRouter.post('/login', async (req: Request, res: Response) => {
  if (!isLocalAuthMode()) {
    return res.status(400).json({ error: 'Local login is only enabled in self-hosted mode.' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const rateLimitKey = `${clientIp}:${email.toLowerCase().trim()}`;
  const rateLimit = checkLoginRateLimit(rateLimitKey);

  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: `Too many failed login attempts. Please wait ${rateLimit.waitSeconds} seconds before trying again.`,
      waitSeconds: rateLimit.waitSeconds
    });
  }

  const sanitizedEmail = email.toLowerCase().trim();

  try {
    const persistence = store.getPersistence();
    const allUsers = await persistence.listUsers();
    const user = allUsers.find((u) => u.email.toLowerCase() === sanitizedEmail);

    if (!user) {
      recordFailedLogin(rateLimitKey);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    let passwordValid = false;
    if (typeof persistence.getLocalCredential === 'function') {
      const cred = await persistence.getLocalCredential(user.id);
      if (cred && cred.passwordHash) {
        passwordValid = await verifyPassword(password, cred.passwordHash);
      }
    }

    if (!passwordValid) {
      recordFailedLogin(rateLimitKey);
      auditService.record({
        orgId: 'system',
        actorId: user.id,
        actorName: user.name,
        actorType: 'USER',
        action: 'auth.login_failed',
        resourceType: 'AUTH',
        resourceId: user.id,
        result: 'FAILURE',
        details: { reason: 'bad_password', ip: clientIp },
        ipAddress: clientIp
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Success: reset rate limiter
    resetLoginRateLimit(rateLimitKey);

    // Resolve user's organizations
    let userOrgs = await persistence.getUserOrganizations(user.id, user.email);
    if (userOrgs.length === 0) {
      userOrgs = store.getOrganizationsForUser(user.id, user.email);
    }

    const primaryOrg = userOrgs[0] || null;
    let userRole: Role = 'VIEWER';
    if (primaryOrg) {
      const access = store.checkUserOrgAccess(user.id, primaryOrg.id, user.email);
      userRole = access.role || 'VIEWER';
    }

    const token = generateLocalJwt({
      id: user.id,
      email: user.email,
      name: user.name,
      role: userRole
    });

    setSessionCookie(res, token);

    auditService.record({
      orgId: primaryOrg?.id || 'system',
      actorId: user.id,
      actorName: user.name,
      actorType: 'USER',
      action: 'auth.login_success',
      resourceType: 'AUTH',
      resourceId: user.id,
      result: 'SUCCESS',
      details: { ip: clientIp },
      ipAddress: clientIp
    });

    return res.json({
      message: 'Login successful',
      token,
      user,
      currentOrg: primaryOrg,
      organizations: userOrgs,
      role: userRole
    });
  } catch (err: any) {
    console.error('[LocalAuth] Login processing error:', err);
    return res.status(500).json({ error: 'An unexpected authentication error occurred.' });
  }
});

/**
 * POST /api/v1/auth/logout
 * Clears session cookie and invalidates authentication.
 */
localAuthRouter.post('/logout', (req: Request, res: Response) => {
  clearSessionCookie(res);
  return res.json({ message: 'Logged out successfully.' });
});

/**
 * GET /api/v1/auth/session
 * Returns current authenticated user and organizations for either Local Auth or Firebase.
 */
localAuthRouter.get('/session', requireUserAuth, async (req: AuthenticatedUserRequest, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Session is missing or expired.' });
  }

  const persistence = store.getPersistence();
  let userOrgs = await persistence.getUserOrganizations(user.id, user.email);
  if (userOrgs.length === 0) {
    userOrgs = store.getOrganizationsForUser(user.id, user.email);
  }

  const activeOrgId = req.headers['x-org-id'] as string;
  const currentOrg = (activeOrgId && userOrgs.find((o) => o.id === activeOrgId)) || userOrgs[0] || null;

  let role: Role = 'VIEWER';
  let members: any[] = [];
  if (currentOrg) {
    const access = store.checkUserOrgAccess(user.id, currentOrg.id, user.email);
    role = access.role || 'VIEWER';
    members = await persistence.getOrgMembers(currentOrg.id);
  }

  res.json({
    user,
    currentOrg,
    organizations: userOrgs,
    role,
    members
  });
});
