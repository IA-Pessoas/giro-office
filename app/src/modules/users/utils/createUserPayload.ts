import type { ModuleKey } from "@modules/auth";

import { MINIMUM_PERMISSION_LEVEL_BY_MODULE } from "../constants/permissionConfig";
import type { AdminCreateUserData, UpdateUserData, UserPermission, UserType } from "../types";

export interface CreateUserFormState {
  name: string;
  login: string;
  password: string;
  department_id: string;
  departmentPermission: UserPermission;
  isOrganizationOwner: boolean;
}

export type CreateUserModuleSelection = {
  enabled: boolean;
  level: UserPermission;
};

export type CreateUserModuleSelectionState = Record<string, CreateUserModuleSelection>;

interface BuildAdminCreateUserPayloadInput {
  formData: CreateUserFormState;
  moduleSelections: CreateUserModuleSelectionState;
  departmentModuleKey?: ModuleKey | null;
  organizationId: string;
  invitedBy?: string;
  canCreateOrganizationOwner?: boolean;
}

export function resolveCreateUserTopLevelPermission(
  departmentPermission: UserPermission,
  isOrganizationOwner: boolean,
): UserPermission {
  if (isOrganizationOwner) {
    return 2;
  }

  return departmentPermission === 0 ? 0 : 1;
}

export function resolveCreateUserType(
  departmentPermission: UserPermission,
  isOrganizationOwner: boolean,
): UserType {
  if (isOrganizationOwner) {
    return "owner";
  }

  return departmentPermission === 0 ? "user" : "admin";
}

export function buildCreateUserModulesPayload(
  moduleSelections: CreateUserModuleSelectionState,
  departmentModuleKey: ModuleKey | null | undefined,
  departmentPermission: UserPermission,
): Record<string, number | null> {
  const modules: Record<string, number | null> = {};

  if (departmentModuleKey) {
    modules[departmentModuleKey] = departmentPermission;
  }

  for (const [moduleKey, selection] of Object.entries(moduleSelections)) {
    if (moduleKey === departmentModuleKey) {
      continue;
    }

    if (selection.enabled) {
      modules[moduleKey] = selection.level;
    }
  }

  for (const [moduleKey, minimumLevel] of Object.entries(
    MINIMUM_PERMISSION_LEVEL_BY_MODULE,
  )) {
    const currentLevel = modules[moduleKey];

    if (typeof currentLevel !== "number" || currentLevel < minimumLevel) {
      modules[moduleKey] = minimumLevel;
    }
  }

  if (departmentPermission >= 1) {
    if ((modules.ti ?? 0) < 1) {
      modules.ti = 1;
    }
    modules.rh = typeof modules.rh === "number" && modules.rh > 1 ? modules.rh : 1;
  }

  return modules;
}

export function buildAdminCreateUserPayload({
  formData,
  moduleSelections,
  departmentModuleKey,
  organizationId,
  invitedBy,
  canCreateOrganizationOwner = false,
}: BuildAdminCreateUserPayloadInput): AdminCreateUserData {
  const isOrganizationOwner =
    canCreateOrganizationOwner && formData.isOrganizationOwner;
  const type = resolveCreateUserType(
    formData.departmentPermission,
    isOrganizationOwner,
  );
  const permission = resolveCreateUserTopLevelPermission(
    formData.departmentPermission,
    isOrganizationOwner,
  );
  const modules = buildCreateUserModulesPayload(
    moduleSelections,
    departmentModuleKey,
    formData.departmentPermission,
  );

  return {
    name: formData.name,
    login: formData.login,
    password: formData.password,
    department_id: formData.department_id,
    permission,
    organization_id: organizationId,
    type,
    status: "active",
    ...(type === "owner" ? {} : { modules }),
    ...(invitedBy ? { invited_by: invitedBy } : {}),
  };
}

export function buildAdminUpdateUserAccessPayload(
  permission: UserPermission,
): Pick<UpdateUserData, "permission" | "type"> {
  return {
    permission,
    type: permission === 2 ? "admin" : "user",
  };
}

export function buildDepartmentPermissionSyncPayload(
  departmentModuleKey: string,
  modules: Record<string, number | null>,
): Pick<UpdateUserData, "permission" | "type" | "modules"> {
  const departmentModuleLevel = modules[departmentModuleKey];
  let permission: UserPermission = 0;

  if (departmentModuleLevel === null) {
    permission = -1;
  } else if (departmentModuleLevel === 2) {
    permission = 2;
  } else if (departmentModuleLevel === 1) {
    permission = 1;
  }

  return {
    ...buildAdminUpdateUserAccessPayload(permission),
    modules,
  };
}

export function needsDepartmentPermissionSync(
  departmentModuleKey: string | null | undefined,
  modules: Record<string, number | null>,
  user: Pick<UpdateUserData, "permission" | "type"> | null | undefined,
): boolean {
  if (!departmentModuleKey || !user) {
    return false;
  }

  const syncPayload = buildDepartmentPermissionSyncPayload(departmentModuleKey, modules);

  return user.permission !== syncPayload.permission || user.type !== syncPayload.type;
}
