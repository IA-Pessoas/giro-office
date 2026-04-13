import { ServiceError } from "@workspace/shared";
import type { Request } from "express";

export function resolveOrganizationId(
  request: Request,
  queryOrganizationId: string | undefined,
): string {
  const fromQuery = queryOrganizationId;
  const fromToken = request.organization_id?.trim() ? request.organization_id : undefined;
  const resolved = fromQuery ?? fromToken;

  if (!resolved) {
    throw new ServiceError(400, "organization_id é obrigatório (query ou token).");
  }

  if (fromToken && fromQuery && fromToken !== fromQuery) {
    throw new ServiceError(403, "organization_id da query não corresponde ao token.");
  }

  return resolved;
}
