import { error as logError } from "../logger/index.js";

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

const DEPARTMENT_MODULE_ALIASES: Record<string, ModulePermissionKey> = {
  certificado: "certificado",
  comercial: "comercial",
  contabil: "contabil",
  contabilidade: "contabil",
  contabil_fiscal: "contabil",
  contabil_societario: "contabil",
  contabil_tributario: "contabil",
  financeiro: "financeiro",
  fiscal: "fiscal",
  integracao: "integracao",
  integracao_de_clientes: "integracao",
  integracao_de_sistemas: "integracao",
  marketing: "marketing",
  parcelamento: "parcelamento",
  pessoal: "pessoal",
  departamento_pessoal: "pessoal",
  regularize: "regularize",
  rh: "rh",
  recursos_humanos: "rh",
  tecnologia: "ti",
  ti: "ti",
  triagem: "triagem",
};

function normalizeDepartmentName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveDepartmentModuleKey(
  departmentName: string | null | undefined,
): ModulePermissionKey | null {
  return DEPARTMENT_MODULE_ALIASES[normalizeDepartmentName(departmentName)] ?? null;
}

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

export function parseModulePermissions(value: string | undefined): ModulePermissions | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return normalizeModulePermissions(parsed);
  } catch (err: unknown) {
    logError("Erro ao interpretar permissões modulares encaminhadas", { err });
    return undefined;
  }
}
