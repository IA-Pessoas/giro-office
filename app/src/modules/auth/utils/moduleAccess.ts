export const GLOBAL_ADMIN_PERMISSION = 2;
export const MODULE_VIEW_PERMISSION = 1;
export const MODULE_EDIT_PERMISSION = 2;
export const MODULE_ADMIN_PERMISSION = 3;

export const MODULE_KEYS = [
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

export type ModuleKey = (typeof MODULE_KEYS)[number];
export const DISABLED_MODULE_KEYS = [
  "comercial",
  "marketing",
  "parcelamento",
  "triagem",
] as const satisfies readonly ModuleKey[];
const DISABLED_MODULE_KEY_SET = new Set<ModuleKey>(DISABLED_MODULE_KEYS);
export type AccessLevel = "none" | "view" | "edit" | "admin";
export type AccessSource = "admin" | "department" | "additional-module" | "none";

export type ModulePermissionSubject =
  | {
      type?: "owner" | "admin" | "user" | null;
      modules?: Record<string, number> | null;
    }
  | null
  | undefined;

export type ModuleAccess = {
  level: AccessLevel;
  canView: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  source: AccessSource;
};

export type AdditionalModulePermissions = Record<string, number>;

export interface ResolveModuleAccessParams {
  userPermission?: number | null;
  departmentModule?: ModuleKey | null;
  module: ModuleKey;
  additionalModulePermissions?: AdditionalModulePermissions | null;
  isGlobalAdmin?: boolean;
}

export const APP_ROUTE_MODULE_MAP: Partial<Record<string, ModuleKey>> = {
  "/clients": "integracao",
  "/projects": "integracao",
  "/tasks": "integracao",
  "/configs/integracao": "integracao",
  "/certificados": "certificado",
  "/regularize": "regularize",
  "/fiscal": "fiscal",
  "/contabil": "contabil",
  "/rh": "rh",
  "/departamento-pessoal": "pessoal",
  "/tecnologia": "ti",
};

function isWithinRoute(routePath: string, basePath: string): boolean {
  return routePath === basePath || routePath.startsWith(`${basePath}/`);
}

export function normalizeRoutePath(routePath: string): string {
  const pathWithoutQuery = routePath.split("?")[0]?.split("#")[0] ?? "";
  const normalizedPath =
    pathWithoutQuery.length > 1 ? pathWithoutQuery.replace(/\/+$/, "") : pathWithoutQuery;

  return normalizedPath || "/";
}

export function getModulePermissionLevel(
  subject: ModulePermissionSubject,
  module: ModuleKey,
): number | null {
  if (subject?.type === "owner") {
    return MODULE_ADMIN_PERMISSION;
  }

  const permission = subject?.modules?.[module];

  return permission === 0 || permission === 1 || permission === 2 || permission === 3
    ? permission
    : null;
}

export function canViewIntegrationRoute(
  routePath: string,
  subject: ModulePermissionSubject,
): boolean {
  const integrationLevel = getModulePermissionLevel(subject, "integracao");

  if (integrationLevel === null) {
    return false;
  }

  const normalizedPath = normalizeRoutePath(routePath);

  if (isWithinRoute(normalizedPath, "/tasks")) {
    return true;
  }

  if (isWithinRoute(normalizedPath, "/configs/integracao")) {
    return integrationLevel >= MODULE_VIEW_PERMISSION;
  }

  return integrationLevel >= MODULE_VIEW_PERMISSION;
}

export function canViewTasksOnlyIntegrationRoute(
  routePath: string,
  subject: ModulePermissionSubject,
): boolean {
  if (getModulePermissionLevel(subject, "integracao") !== 0) {
    return true;
  }

  return isWithinRoute(normalizeRoutePath(routePath), "/tasks");
}

const DEPARTMENT_MODULE_ALIASES: Record<string, ModuleKey> = {
  certificado: "certificado",
  comercial: "comercial",
  contabil: "contabil",
  "contabil fiscal": "contabil",
  "contabil societario": "contabil",
  "contabil societário": "contabil",
  "contabil tributario": "contabil",
  contábil: "contabil",
  financeiro: "financeiro",
  fiscal: "fiscal",
  integracao: "integracao",
  "integracao de sistemas": "integracao",
  integração: "integracao",
  marketing: "marketing",
  parcelamento: "parcelamento",
  pessoal: "pessoal",
  "departamento pessoal": "pessoal",
  regularize: "regularize",
  rh: "rh",
  "recursos humanos": "rh",
  tecnologia: "ti",
  ti: "ti",
  triagem: "triagem",
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

export function isModuleDisabled(module: ModuleKey): boolean {
  return DISABLED_MODULE_KEY_SET.has(module);
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

export function resolveAccessLevelFromAdditionalPermission(
  permission: number | undefined,
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
  module,
  additionalModulePermissions,
  isGlobalAdmin = false,
}: ResolveModuleAccessParams): ModuleAccess {
  if (isModuleDisabled(module)) {
    return createModuleAccess("none", "none");
  }

  if (isGlobalAdmin) {
    return createModuleAccess("admin", "admin");
  }

  const additionalPermission = additionalModulePermissions?.[module];
  const additionalLevel = resolveAccessLevelFromAdditionalPermission(additionalPermission);

  if (additionalLevel !== "none") {
    return createModuleAccess(additionalLevel, "additional-module");
  }

  return createModuleAccess("none", "none");
}
