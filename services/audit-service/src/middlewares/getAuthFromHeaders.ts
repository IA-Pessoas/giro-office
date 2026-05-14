import { AUDIT_ADMIN_PERMISSION, type ForwardedAuditAuthContext } from "@workspace/shared/audit";
import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
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

  if (!userId || !organizationId) {
    throw new ServiceError(401, "Não autenticado.");
  }

  return {
    userId,
    organizationId,
    permission: parsePermission(request.get(FORWARDED_AUTH_PERMISSION_HEADER) ?? undefined),
  };
}

export function assertAuditAdmin(auth: ForwardedAuditAuthContext): void {
  if ((auth.permission ?? 0) < AUDIT_ADMIN_PERMISSION) {
    throw new ServiceError(403, "Acesso negado para esta rota.");
  }
}
