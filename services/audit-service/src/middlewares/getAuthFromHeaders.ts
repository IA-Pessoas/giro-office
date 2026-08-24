import { AUDIT_ADMIN_PERMISSION, type ForwardedAuditAuthContext } from "@workspace/shared/audit";
import {
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  ServiceError,
} from "@workspace/shared/http";
import type { Request } from "express";

function parsePermission(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw new ServiceError(400, "Cabeçalhos de auditoria inválidos.");
  }

  return parsed;
}

export function getAuthFromHeaders(request: Request): ForwardedAuditAuthContext {
  const userId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const authKind = request.get(FORWARDED_AUTH_KIND_HEADER);
  const platformRole = request.get(FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const isPlatformSuperAdmin = authKind === "platform" && platformRole === "super_admin";

  if (
    !userId ||
    (authKind !== undefined && authKind !== "organization" && authKind !== "platform") ||
    (authKind === "platform" && !isPlatformSuperAdmin) ||
    (authKind !== "platform" && platformRole !== undefined) ||
    (!isPlatformSuperAdmin && !organizationId)
  ) {
    throw new ServiceError(401, "Não autenticado.");
  }

  return {
    userId,
    ...(organizationId ? { organizationId } : {}),
    permission: parsePermission(request.get(FORWARDED_AUTH_PERMISSION_HEADER) ?? undefined),
    ...(isPlatformSuperAdmin
      ? { authKind: "platform" as const, platformRole: "super_admin" as const }
      : authKind === "organization"
        ? { authKind: "organization" as const }
        : {}),
  };
}

export function assertAuditSearchAdmin(auth: ForwardedAuditAuthContext): void {
  if (auth.authKind === "platform" && auth.platformRole === "super_admin") {
    return;
  }

  assertAuditAdmin(auth);
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
