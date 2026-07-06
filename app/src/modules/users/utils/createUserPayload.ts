import type { ModuleKey } from "@modules/auth";

import type { AdminCreateUserData, UserPermission, UserType } from "../types";

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
