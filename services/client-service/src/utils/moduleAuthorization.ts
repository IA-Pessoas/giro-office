import { normalizeModulePermission, ServiceError } from "@workspace/shared";
import type { Request } from "express";

const CLIENT_DOMAIN_MODULES = [
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "pessoal",
  "regularize",
] as const;

const CLIENT_DOMAIN_READ_PERMISSION = 1;
export const CLIENT_DOMAIN_EDIT_PERMISSION = 2;

function requireModules(request: Request): Record<string, number> {
  if (request.user_type === "owner") {
    return request.modules ?? {};
  }

  if (request.modules === undefined) {
    throw new ServiceError(403, "Contexto modular ausente.");
  }

  return request.modules;
}

export function requireClientDomainModule(
  request: Request,
  module: "comercial" | "financeiro" | "regularize",
  minPermission = CLIENT_DOMAIN_READ_PERMISSION,
): void {
  if (normalizeModulePermission(requireModules(request)[module]) < minPermission) {
    throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
  }
}

export function requireClientDomainAccess(
  request: Request,
  minPermission = CLIENT_DOMAIN_READ_PERMISSION,
): void {
  const modules = requireModules(request);
  const hasDomainPermission = CLIENT_DOMAIN_MODULES.some(
    (module) => normalizeModulePermission(modules[module]) >= minPermission,
  );

  if (!hasDomainPermission && request.user_type !== "owner") {
    throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
  }
}
