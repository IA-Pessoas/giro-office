const GLOBAL_ADMIN_PERMISSION = 2;
const RH_MANAGEMENT_PERMISSION = 2;

export interface RhAssignableUserCandidate {
  id: string;
  status?: string | null;
  permission?: number | null;
  departmentName?: string | null;
  modules?: Record<string, number | null> | null;
}

export function normalizeAssignableUserStatus(status: string | null | undefined) {
  if (status === "active" || status === "Ativo") {
    return "active";
  }

  if (status === "inactive" || status === "Inativo") {
    return "inactive";
  }

  return status ?? null;
}

function isAdminPermission(permission?: number | null): boolean {
  return typeof permission === "number" && permission >= GLOBAL_ADMIN_PERMISSION;
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

function isRhDepartment(departmentName?: string | null): boolean {
  const normalizedDepartmentName = normalizeDepartmentName(departmentName);

  return normalizedDepartmentName === "rh" || normalizedDepartmentName === "recursos humanos";
}

export function isAssignableRhResponsibleUser(user: RhAssignableUserCandidate): boolean {
  if (normalizeAssignableUserStatus(user.status) !== "active") {
    return false;
  }

  if (isAdminPermission(user.permission)) {
    return true;
  }

  if ((user.modules?.rh ?? 0) >= RH_MANAGEMENT_PERMISSION) {
    return true;
  }

  return isRhDepartment(user.departmentName);
}

export function filterAssignableRhResponsibleUsers<TUser extends RhAssignableUserCandidate>(
  users: TUser[],
): TUser[] {
  return users.filter(isAssignableRhResponsibleUser);
}
