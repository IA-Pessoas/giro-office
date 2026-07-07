import type { AdminCreateUserData, UpdateUserData, UserPermission, UserType } from "../types";

export type CreateUserModuleSelection = {
  enabled: boolean;
  level: 0 | 1 | 2;
};

export type CreateUserModuleSelections = Record<string, CreateUserModuleSelection>;

interface BuildAdminCreateUserPayloadInput {
  name: string;
  login: string;
  password: string;
  department_id: string;
  permission: UserPermission;
  organizationId: string;
  isOrganizationOwner: boolean;
  moduleSelections: CreateUserModuleSelections;
  departmentModuleKey?: string | null;
  invitedBy?: string;
}

export function getUserTypeFromPermission(
  permission: UserPermission,
  isOrganizationOwner = false,
): UserType {
  if (isOrganizationOwner) {
    return "owner";
  }

  if (permission === 2) {
    return "admin";
  }

  return "user";
}

export function getEffectivePermission(
  permission: UserPermission,
  isOrganizationOwner = false,
): UserPermission {
  return isOrganizationOwner ? 2 : permission;
}

export function buildModulesPayload(
  moduleSelections: CreateUserModuleSelections,
  departmentModuleKey?: string | null,
): Record<string, number | null> {
  return Object.entries(moduleSelections).reduce<Record<string, number | null>>(
    (acc, [key, config]) => {
      if (key === departmentModuleKey) {
        return acc;
      }

      if (config.enabled) {
        acc[key] = config.level;
      }

      return acc;
    },
    {},
  );
}

export function buildAdminCreateUserPayload(
  input: BuildAdminCreateUserPayloadInput,
): AdminCreateUserData {
  const permission = getEffectivePermission(input.permission, input.isOrganizationOwner);
  const type = getUserTypeFromPermission(input.permission, input.isOrganizationOwner);
  const modules = buildModulesPayload(input.moduleSelections, input.departmentModuleKey);

  return {
    name: input.name,
    login: input.login,
    password: input.password,
    department_id: input.department_id,
    permission,
    organization_id: input.organizationId,
    type,
    status: "active",
    ...(type !== "owner" && Object.keys(modules).length > 0 ? { modules } : {}),
    ...(input.invitedBy ? { invited_by: input.invitedBy } : {}),
  };
}

export function buildAdminUpdateUserAccessPayload(
  permission: UserPermission,
  isOrganizationOwner = false,
): Pick<UpdateUserData, "permission" | "type"> {
  return {
    permission: getEffectivePermission(permission, isOrganizationOwner),
    type: getUserTypeFromPermission(permission, isOrganizationOwner),
  };
}
