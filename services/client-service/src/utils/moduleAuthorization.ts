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

const CLIENT_LIST_MODULES = [...CLIENT_DOMAIN_MODULES, "integracao"] as const;

export function hasClientListModuleAccess(modules: Record<string, number> | undefined): boolean {
  return CLIENT_LIST_MODULES.some((module) => normalizeModulePermission(modules?.[module]) >= 1);
}

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
): void {
  if (normalizeModulePermission(requireModules(request)[module]) < 1) {
    throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
  }
}

export function requireClientDomainAccess(request: Request): void {
  const modules = requireModules(request);
  const hasDomainPermission = CLIENT_DOMAIN_MODULES.some(
    (module) => normalizeModulePermission(modules[module]) >= 1,
  );

  if (!hasDomainPermission && request.user_type !== "owner") {
    throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
  }
}
