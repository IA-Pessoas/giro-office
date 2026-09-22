import {
  authenticateWorkerRequest,
  type WorkerAuthContext,
  WorkerAuthenticationError,
} from "@workspace/runtime";
import type { ForwardedAuditAuthContext } from "@workspace/shared/audit";
import { AUDIT_ADMIN_PERMISSION } from "@workspace/shared/audit";
import {
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared/http";

import type { AuditWorkerEnv } from "./env.js";

function parsePermission(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) throw new ServiceError(400, "Cabeçalhos de auditoria inválidos.");
  return parsed;
}

function forwardedAuth(request: Request): ForwardedAuditAuthContext | undefined {
  const userId = request.headers.get(FORWARDED_AUTH_USER_ID_HEADER);
  if (!userId) return undefined;

  const organizationId = request.headers.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const authKind = request.headers.get(FORWARDED_AUTH_KIND_HEADER);
  const platformRole = request.headers.get(FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const permissionHeader = request.headers.get(FORWARDED_AUTH_PERMISSION_HEADER);
  const isPlatformSuperAdmin = authKind === "platform" && platformRole === "super_admin";

  if (
    (authKind !== null && authKind !== "organization" && authKind !== "platform") ||
    (authKind === "platform" && !isPlatformSuperAdmin) ||
    (authKind !== "platform" && platformRole !== null) ||
    (!isPlatformSuperAdmin && !organizationId)
  ) {
    throw new ServiceError(401, "Não autenticado.");
  }
  if (isPlatformSuperAdmin && (organizationId || permissionHeader !== null)) {
    throw new ServiceError(403, "Acesso negado para esta rota.");
  }

  return {
    userId,
    ...(organizationId ? { organizationId } : {}),
    permission: parsePermission(permissionHeader),
    ...(isPlatformSuperAdmin
      ? { authKind: "platform" as const, platformRole: "super_admin" as const }
      : authKind === "organization"
        ? { authKind: "organization" as const }
        : {}),
  };
}

function fromWorkerAuth(auth: WorkerAuthContext): ForwardedAuditAuthContext {
  if (auth.actorKind === "platform" && !auth.isPlatformAdmin) {
    throw new ServiceError(401, "Não autenticado.");
  }
  return {
    userId: auth.userId,
    ...(auth.organizationId ? { organizationId: auth.organizationId } : {}),
    ...(typeof auth.claims.permission === "number" ? { permission: auth.claims.permission } : {}),
    authKind: auth.actorKind,
    ...(auth.isPlatformAdmin ? { platformRole: "super_admin" as const } : {}),
  };
}

export async function authenticateAuditRequest(
  request: Request,
  env: AuditWorkerEnv,
): Promise<ForwardedAuditAuthContext> {
  if (request.headers.get(INTERNAL_SERVICE_TOKEN_HEADER) !== env.INTERNAL_SERVICE_TOKEN) {
    throw new ServiceError(401, "Não autenticado.");
  }

  const forwarded = forwardedAuth(request);
  if (forwarded) return forwarded;

  try {
    return fromWorkerAuth(
      await authenticateWorkerRequest(request, { jwtSecret: env.JWT_SECRET, allowBearer: true }),
    );
  } catch (error) {
    if (error instanceof WorkerAuthenticationError) throw new ServiceError(401, "Não autenticado.");
    throw error;
  }
}

export function assertAuditAdmin(auth: ForwardedAuditAuthContext): void {
  if (
    auth.authKind === "platform" ||
    !auth.organizationId ||
    (auth.permission ?? 0) < AUDIT_ADMIN_PERMISSION
  ) {
    throw new ServiceError(403, "Acesso negado para esta rota.");
  }
}

export function assertAuditSearchAdmin(auth: ForwardedAuditAuthContext): void {
  if (auth.authKind === "platform" && auth.platformRole === "super_admin") {
    if (!auth.organizationId && auth.permission === undefined) return;
    throw new ServiceError(403, "Acesso negado para esta rota.");
  }
  assertAuditAdmin(auth);
}
