export const GLOBAL_ADMIN_PERMISSION = 2;
export const MODULE_VIEW_PERMISSION = 0;
export const MODULE_EDIT_PERMISSION = 1;
export const MODULE_ADMIN_PERMISSION = 2;

export const MODULE_KEYS = [
  "atendimento",
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pec",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
  "wiki",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
export type AccessLevel = "none" | "view" | "edit" | "admin";
export type AccessSource = "admin" | "department" | "additional-module" | "none";

export type ModuleAccess = {
  level: AccessLevel;
  canView: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  source: AccessSource;
};

export type AdditionalModulePermissions = Record<string, number | null>;

export interface ResolveModuleAccessParams {
  userPermission?: number | null;
  departmentModule?: ModuleKey | null;
  module: ModuleKey;
  additionalModulePermissions?: AdditionalModulePermissions | null;
}

export const APP_ROUTE_MODULE_MAP: Partial<Record<string, ModuleKey>> = {
  "/comercial": "comercial",
  "/marketing": "marketing",
  "/certificados": "certificado",
  "/regularize": "regularize",
  "/fiscal": "fiscal",
  "/contabil": "contabil",
  "/rh": "rh",
  "/departamento-pessoal": "pessoal",
  "/tecnologia": "ti",
  "/triagem": "triagem",
  "/parcelamento": "parcelamento",
};

const DEPARTMENT_MODULE_ALIASES: Record<string, ModuleKey> = {
  atendimento: "atendimento",
  certificado: "certificado",
  comercial: "comercial",
  contabil: "contabil",
  "contabil fiscal": "contabil",
  "contabil societario": "contabil",
  "contabil societário": "contabil",
  "contabil tributario": "contabil",
  "contábil": "contabil",
  financeiro: "financeiro",
  fiscal: "fiscal",
  integracao: "integracao",
  "integracao de sistemas": "integracao",
  "integração": "integracao",
  marketing: "marketing",
  parcelamento: "parcelamento",
  pec: "pec",
  pessoal: "pessoal",
  "departamento pessoal": "pessoal",
  regularize: "regularize",
  rh: "rh",
  "recursos humanos": "rh",
  tecnologia: "ti",
  ti: "ti",
  triagem: "triagem",
  wiki: "wiki",
};

function createModuleAccess(level: AccessLevel, source: AccessSource): ModuleAccess {
  return {
    level,
    canView: level !== "none",
    canEdit: level === "edit" || level === "admin",
    isAdmin: level === "admin",
    source,
  };
}

function normalizeDepartmentName(value?: string | null): string {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function resolveAccessLevelFromGlobalPermission(permission?: number | null): AccessLevel {
  if (typeof permission === "number" && permission >= GLOBAL_ADMIN_PERMISSION) {
    return "admin";
  }

  if (permission === MODULE_EDIT_PERMISSION) {
    return "edit";
  }

  if (permission === MODULE_VIEW_PERMISSION) {
    return "view";
  }

  return "none";
}

export function resolveAccessLevelFromAdditionalPermission(
  permission: number | null | undefined,
): AccessLevel {
  if (permission === MODULE_ADMIN_PERMISSION) {
    return "admin";
  }

  if (permission === MODULE_EDIT_PERMISSION) {
    return "edit";
  }

  if (permission === MODULE_VIEW_PERMISSION) {
    return "view";
  }

  return "none";
}

export function resolveDepartmentModuleKey(departmentName?: string | null): ModuleKey | null {
  const normalizedDepartmentName = normalizeDepartmentName(departmentName);

  if (!normalizedDepartmentName) {
    return null;
  }

  return DEPARTMENT_MODULE_ALIASES[normalizedDepartmentName] ?? null;
}

export function resolveModuleAccess({
  userPermission,
  departmentModule,
  module,
  additionalModulePermissions,
}: ResolveModuleAccessParams): ModuleAccess {
  if (typeof userPermission === "number" && userPermission >= GLOBAL_ADMIN_PERMISSION) {
    return createModuleAccess("admin", "admin");
  }

  if (departmentModule === module) {
    return createModuleAccess(resolveAccessLevelFromGlobalPermission(userPermission), "department");
  }

  const additionalPermission = additionalModulePermissions?.[module];
  const additionalLevel = resolveAccessLevelFromAdditionalPermission(additionalPermission);

  if (additionalLevel !== "none") {
    return createModuleAccess(additionalLevel, "additional-module");
  }

  return createModuleAccess("none", "none");
}
