import {
  AUTH_SESSION_COOKIE_NAME,
  authenticateWorkerRequest,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  hashCsrfToken,
  readCookie,
  verifyCsrfToken,
  type WorkerAuthContext,
} from "@workspace/runtime";
import type { Next } from "hono";

import { OrganizationWorkerError } from "./errors.js";
import type {
  OrganizationPrismaClient,
  OrganizationWorkerEnv,
  PlatformSessionRecord,
} from "./types.js";

export const AUTH_CONTEXT = "organizationAuth";
export const PLATFORM_CONTEXT = "platformIdentity";

export interface PlatformIdentity {
  id: string;
  name: string;
  email: string;
  auth_kind: "platform";
  platform_role: "super_admin";
}

function forwardedOrganizationAuth(c: WorkerContext): WorkerAuthContext | undefined {
  const forwardedUserId = c.req.header("x-auth-user-id");
  if (!forwardedUserId) return undefined;

  if (c.req.header("x-internal-service-token") !== c.env.INTERNAL_SERVICE_TOKEN) {
    throw new OrganizationWorkerError(401, "Não autenticado.");
  }
  if (c.req.header("x-auth-kind") !== "organization") {
    throw new OrganizationWorkerError(401, "Não autenticado.");
  }

  return {
    token: "forwarded",
    userId: forwardedUserId,
    organizationId: c.req.header("x-auth-organization-id") ?? "",
    actorKind: "organization",
    isPlatformAdmin: false,
    claims: {
      user_id: forwardedUserId,
      organization_id: c.req.header("x-auth-organization-id") ?? undefined,
      auth_kind: "organization",
      modules: {},
      modulePermissionsPresent: c.req.header("x-auth-modules") !== undefined,
    } as WorkerAuthContext["claims"],
  };
}

interface WorkerContext {
  readonly env: OrganizationWorkerEnv;
  readonly req: {
    header(name: string): string | undefined;
    raw: Request;
  };
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export async function requireOrganizationAuth<E extends WorkerContext>(
  c: E,
  next: Next,
): Promise<void> {
  const forwarded = forwardedOrganizationAuth(c);
  let auth: WorkerAuthContext;
  try {
    auth =
      forwarded ??
      (await authenticateWorkerRequest(c.req.raw, {
        jwtSecret: c.env.JWT_SECRET,
        allowBearer: true,
      }));
  } catch (error) {
    if (error instanceof OrganizationWorkerError) throw error;
    throw new OrganizationWorkerError(401, "Não autenticado.", error);
  }

  if (auth.actorKind !== "organization") {
    throw new OrganizationWorkerError(401, "Não autenticado.");
  }

  const legacyUserId = c.req.header("user_id");
  const legacyOrganizationId = c.req.header("organization_id");
  if (legacyUserId && legacyUserId !== auth.userId) {
    throw new OrganizationWorkerError(400, "Cabeçalho user_id não corresponde ao token.");
  }
  if (legacyOrganizationId && legacyOrganizationId !== auth.organizationId) {
    throw new OrganizationWorkerError(400, "Cabeçalho organization_id não corresponde ao token.");
  }

  c.set(AUTH_CONTEXT, auth);
  await next();
}

export async function requirePlatformSession<E extends WorkerContext>(
  c: E,
  prisma: OrganizationPrismaClient,
  next: Next,
): Promise<void> {
  if (c.req.header("x-internal-service-token") !== c.env.INTERNAL_SERVICE_TOKEN) {
    throw new OrganizationWorkerError(401, "Não autenticado.");
  }
  if (
    c.req.header("x-auth-kind") !== "platform" ||
    c.req.header("x-auth-platform-role") !== "super_admin"
  ) {
    throw new OrganizationWorkerError(403, "Acesso negado.");
  }

  const forwardedUserId = c.req.header("x-auth-user-id");
  if (!forwardedUserId) throw new OrganizationWorkerError(401, "Não autenticado.");

  let auth: WorkerAuthContext;
  try {
    auth = await authenticateWorkerRequest(c.req.raw, {
      jwtSecret: c.env.JWT_SECRET,
      allowBearer: false,
    });
  } catch (error) {
    throw new OrganizationWorkerError(401, "Não autenticado.", error);
  }
  if (
    auth.actorKind !== "platform" ||
    !auth.isPlatformAdmin ||
    auth.userId !== forwardedUserId ||
    !auth.claims.session_id ||
    auth.claims.session_version === undefined ||
    !auth.claims.csrf_hash
  ) {
    throw new OrganizationWorkerError(401, "Não autenticado.");
  }

  const session = await prisma.platformAuthSession.findFirst({
    where: {
      id: auth.claims.session_id,
      platform_user_id: auth.userId,
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
          platform_role: true,
          status: true,
          session_version: true,
        },
      },
    },
  });

  if (!isValidPlatformSession(session, auth)) {
    throw new OrganizationWorkerError(401, "Não autenticado.");
  }

  c.set(AUTH_CONTEXT, auth);
  c.set(PLATFORM_CONTEXT, {
    id: session.platformUser?.id ?? auth.userId,
    name: session.platformUser?.name ?? "",
    email: session.platformUser?.email ?? "",
    auth_kind: "platform",
    platform_role: "super_admin",
  } satisfies PlatformIdentity);
  await next();
}

function isValidPlatformSession(
  session: PlatformSessionRecord | null,
  auth: WorkerAuthContext,
): session is PlatformSessionRecord & {
  platformUser: NonNullable<PlatformSessionRecord["platformUser"]>;
} {
  const user = session?.platformUser;
  return Boolean(
    session &&
      user &&
      user.id === auth.userId &&
      user.platform_role === "super_admin" &&
      user.status === "active" &&
      user.session_version === auth.claims.session_version &&
      session.csrf_hash === auth.claims.csrf_hash,
  );
}

export async function requirePlatformCsrf<E extends WorkerContext>(
  c: E,
  next: Next,
): Promise<void> {
  const cookieToken = readCookie(c.req.header("cookie"), CSRF_COOKIE_NAME);
  const sessionToken = readCookie(c.req.header("cookie"), AUTH_SESSION_COOKIE_NAME);
  const submittedToken = c.req.header(CSRF_HEADER_NAME);
  const auth = c.get(AUTH_CONTEXT) as WorkerAuthContext | undefined;
  const expectedHash = auth?.claims.csrf_hash;
  if (
    !cookieToken ||
    !sessionToken ||
    !submittedToken ||
    !expectedHash ||
    !(await verifyCsrfToken(submittedToken, await hashCsrfToken(cookieToken))) ||
    !(await verifyCsrfToken(submittedToken, expectedHash))
  ) {
    throw new OrganizationWorkerError(403, "Requisição não autorizada.");
  }
  await next();
}
