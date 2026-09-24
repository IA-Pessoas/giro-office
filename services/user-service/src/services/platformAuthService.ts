import { randomUUID } from "node:crypto";

import {
  createCsrfToken,
  hashCsrfToken,
  SESSION_MAX_AGE_SECONDS,
  ServiceError,
} from "@workspace/shared";
import jwt from "jsonwebtoken";

import { getUserServiceEnv } from "../config/env.js";
import prismaClient from "../prisma/index.js";
import { verifyPassword } from "../security/passwordHashService.js";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,p=1,t=2$lktGNqJmnbIyj6tMoe+a8Q$HRtIIMh3LPpaIs9yyun/WOjqfivhgr4Nt3m9wsIkTsQ";
const CSRF_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const PLATFORM_AUTH_KIND = "platform" as const;
const PLATFORM_ROLE = "super_admin" as const;

export interface PlatformLoginRequest {
  email: string;
  password: string;
}

export interface PlatformSessionClaims {
  user_id: string;
  auth_kind: typeof PLATFORM_AUTH_KIND;
  platform_role: typeof PLATFORM_ROLE;
  session_version: number;
  session_id: string;
  csrf_hash: string;
}

export interface PlatformIdentity {
  id: string;
  name: string;
  email: string;
  auth_kind: typeof PLATFORM_AUTH_KIND;
  platform_role: typeof PLATFORM_ROLE;
  can_impersonate: boolean;
}

export interface IssuedPlatformSession {
  identity: PlatformIdentity;
  token: string;
  csrfToken: string;
}

interface PlatformUserRecord {
  id: string;
  name: string;
  email: string;
  password: string;
  platform_role: string;
  status: string;
  can_impersonate: boolean;
  session_version: number;
}

interface ActivePlatformSession {
  csrf_hash: string;
  platformUser?: PlatformUserRecord;
}

export interface PlatformAuthRepository {
  findByEmail(email: string): Promise<PlatformUserRecord | null>;
  findById(id: string): Promise<PlatformUserRecord | null>;
  createSession(data: {
    id: string;
    platform_user_id: string;
    csrf_hash: string;
    expires_at: Date;
  }): Promise<unknown>;
  findActiveSession(data: {
    id: string;
    platform_user_id: string;
  }): Promise<ActivePlatformSession | null>;
  rotateSession(data: {
    id: string;
    platform_user_id: string;
    csrf_hash: string;
    next_csrf_hash: string;
    expires_at: Date;
  }): Promise<number>;
  revokeSession(data: { id: string; platform_user_id: string }): Promise<number>;
}

function getSessionExpiry(): Date {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}

function invalidSession(): never {
  throw new ServiceError(401, "Não autenticado.");
}

function isActiveSuperAdmin(
  user: PlatformUserRecord | null | undefined,
): user is PlatformUserRecord {
  return user?.status === "active" && user.platform_role === PLATFORM_ROLE;
}

export function issuePlatformSession(
  user: {
    id: string;
    name: string;
    email: string;
    can_impersonate: boolean;
    session_version: number;
  },
  sessionId: string,
  csrfToken: string,
): IssuedPlatformSession {
  const token = jwt.sign(
    {
      user_id: user.id,
      auth_kind: PLATFORM_AUTH_KIND,
      platform_role: PLATFORM_ROLE,
      session_version: user.session_version,
      session_id: sessionId,
      csrf_hash: hashCsrfToken(csrfToken),
      name: user.name,
      login: user.email,
    },
    getUserServiceEnv().jwtSecret,
    { expiresIn: SESSION_MAX_AGE_SECONDS },
  );

  return {
    identity: {
      id: user.id,
      name: user.name,
      email: user.email,
      auth_kind: PLATFORM_AUTH_KIND,
      platform_role: PLATFORM_ROLE,
      can_impersonate: user.can_impersonate,
    },
    token,
    csrfToken,
  };
}

const prismaRepository: PlatformAuthRepository = {
  findByEmail: (email) =>
    prismaClient.platformUser.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        platform_role: true,
        status: true,
        can_impersonate: true,
        session_version: true,
      },
    }),
  findById: (id) =>
    prismaClient.platformUser.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        platform_role: true,
        status: true,
        can_impersonate: true,
        session_version: true,
      },
    }),
  createSession: (data) => prismaClient.platformAuthSession.create({ data }),
  findActiveSession: ({ id, platform_user_id }) =>
    prismaClient.platformAuthSession.findFirst({
      where: {
        id,
        platform_user_id,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      select: {
        csrf_hash: true,
        platformUser: {
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            platform_role: true,
            status: true,
            can_impersonate: true,
            session_version: true,
          },
        },
      },
    }),
  rotateSession: async ({ id, platform_user_id, csrf_hash, next_csrf_hash, expires_at }) => {
    const { count } = await prismaClient.platformAuthSession.updateMany({
      where: {
        id,
        platform_user_id,
        csrf_hash,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      data: { csrf_hash: next_csrf_hash, expires_at },
    });
    return count;
  },
  revokeSession: async ({ id, platform_user_id }) => {
    const { count } = await prismaClient.platformAuthSession.updateMany({
      where: { id, platform_user_id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return count;
  },
};

export class PlatformAuthService {
  constructor(private readonly repository: PlatformAuthRepository = prismaRepository) {}

  private issueSession(
    user: PlatformUserRecord,
    sessionId: string,
    csrfToken: string,
  ): IssuedPlatformSession {
    return issuePlatformSession(user, sessionId, csrfToken);
  }

  async login({ email, password }: PlatformLoginRequest): Promise<IssuedPlatformSession> {
    const user = await this.repository.findByEmail(email.trim().toLowerCase());
    const verification = await verifyPassword(password, user?.password ?? DUMMY_PASSWORD_HASH);
    if (!verification.valid || !isActiveSuperAdmin(user)) {
      throw new ServiceError(401, "Login ou senha inválidos.");
    }

    const csrfToken = createCsrfToken();
    const sessionId = randomUUID();
    await this.repository.createSession({
      id: sessionId,
      platform_user_id: user.id,
      csrf_hash: hashCsrfToken(csrfToken),
      expires_at: getSessionExpiry(),
    });

    return this.issueSession(user, sessionId, csrfToken);
  }

  async validateSession(identity: PlatformSessionClaims): Promise<PlatformIdentity> {
    if (
      identity.auth_kind !== PLATFORM_AUTH_KIND ||
      identity.platform_role !== PLATFORM_ROLE ||
      !identity.user_id ||
      !identity.session_id ||
      !Number.isSafeInteger(identity.session_version) ||
      identity.session_version < 0 ||
      !CSRF_HASH_PATTERN.test(identity.csrf_hash)
    ) {
      return invalidSession();
    }

    const session = await this.repository.findActiveSession({
      id: identity.session_id,
      platform_user_id: identity.user_id,
    });
    const user = session?.platformUser;
    if (
      !isActiveSuperAdmin(user) ||
      session?.csrf_hash !== identity.csrf_hash ||
      user.session_version !== identity.session_version
    ) {
      return invalidSession();
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      auth_kind: PLATFORM_AUTH_KIND,
      platform_role: PLATFORM_ROLE,
      can_impersonate: user.can_impersonate,
    };
  }

  async refreshSession(identity: PlatformSessionClaims): Promise<IssuedPlatformSession> {
    await this.validateSession(identity);
    const user = await this.repository.findById(identity.user_id);
    if (!isActiveSuperAdmin(user) || user.session_version !== identity.session_version) {
      return invalidSession();
    }

    const csrfToken = createCsrfToken();
    const rotated = await this.repository.rotateSession({
      id: identity.session_id,
      platform_user_id: identity.user_id,
      csrf_hash: identity.csrf_hash,
      next_csrf_hash: hashCsrfToken(csrfToken),
      expires_at: getSessionExpiry(),
    });
    if (rotated !== 1) {
      const current = await this.repository.findActiveSession({
        id: identity.session_id,
        platform_user_id: identity.user_id,
      });
      if (current?.csrf_hash && current.csrf_hash !== identity.csrf_hash) {
        throw new ServiceError(409, "Sessão substituída por uma renovação mais recente.");
      }
      return invalidSession();
    }

    return this.issueSession(user, identity.session_id, csrfToken);
  }

  async revokeSession(identity: PlatformSessionClaims): Promise<void> {
    await this.validateSession(identity);
    if (
      (await this.repository.revokeSession({
        id: identity.session_id,
        platform_user_id: identity.user_id,
      })) !== 1
    ) {
      return invalidSession();
    }
  }
}
