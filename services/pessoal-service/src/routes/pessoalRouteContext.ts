import { ServiceError } from "@workspace/shared";
import type { Request } from "express";

import type { PessoalAuthContext } from "../services/pessoalServiceTypes.js";

export function getPessoalRouteContext(request: Request): PessoalAuthContext {
  if (!request.organization_id || !request.user_id) {
    throw new ServiceError(401, "Autenticacao obrigatoria.");
  }

  return {
    organizationId: request.organization_id,
    userId: request.user_id,
    permission: request.permission,
    requestId: request.requestId,
  };
}

export function getPessoalOrganizationContext(request: Request): { organizationId: string } {
  if (!request.organization_id) {
    throw new ServiceError(401, "Autenticacao obrigatoria.");
  }

  return { organizationId: request.organization_id };
}
