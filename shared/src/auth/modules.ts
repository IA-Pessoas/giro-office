export const ACTIVE_MODULE_KEYS = [
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
] as const;

export const RETIRED_MODULE_KEYS = ["atendimento", "pec", "wiki"] as const;

export type ModulePermissionKey = (typeof ACTIVE_MODULE_KEYS)[number];
export type ModulePermissions = Record<ModulePermissionKey, number>;

export function isModulePermission(value: unknown): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function normalizeModulePermission(value: unknown): 0 | 1 | 2 | 3 {
  return isModulePermission(value) ? value : 0;
}

export function normalizeModulePermissions(value: unknown): ModulePermissions {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const modules = {} as ModulePermissions;

  for (const moduleKey of ACTIVE_MODULE_KEYS) {
    modules[moduleKey] = normalizeModulePermission((source as Record<string, unknown>)[moduleKey]);
  }

  return modules;
}
