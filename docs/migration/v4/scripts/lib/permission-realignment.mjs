export const REALIGNMENT_USER_TYPE = "user";
export const REALIGNMENT_GLOBAL_PERMISSION = 1;

export const MODULE_COLUMNS = Object.freeze([
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
]);

const DEPARTMENT_KEYS = Object.freeze({
  rh: "rh",
  recursos_humanos: "rh",
  tecnologia: "tecnologia",
  ti: "tecnologia",
});

export function mapLegacyModuleLevel(value, { exceptionalDepartment = false } = {}) {
  const level = parseLegacyLevel(value);
  if (level === null) return null;
  if (exceptionalDepartment) return level === 0 ? 1 : 3;
  return level === 0 ? 0 : level === 1 ? 2 : 3;
}

export function mapLegacyUserStatus(value) {
  const status = normalizeKey(value);
  if (status === "ativo") return "active";
  if (status === "inativo") return "inactive";
  return null;
}

export function normalizeDepartmentKey(value) {
  return DEPARTMENT_KEYS[normalizeKey(value)] ?? null;
}

export function buildPermissionRealignment({ users, departments, moduleRowsByModule, dynamicRows }) {
  const departmentsById = new Map(
    departments
      .map((department) => [normalizeKey(department.id), normalizeDepartmentKey(department.nome)])
      .filter(([id]) => id !== null),
  );
  const updatesByUser = new Map();

  for (const user of users) {
    const legacyUserId = normalizeKey(user.id);
    if (legacyUserId === null) continue;
    const department = departmentsById.get(normalizeKey(user.departamento_id)) ?? null;
    updatesByUser.set(legacyUserId, {
      legacyUserId,
      department,
      status: mapLegacyUserStatus(user.status),
      modules: Object.fromEntries(MODULE_COLUMNS.map((column) => [column, 0])),
      invalidStatus: mapLegacyUserStatus(user.status) === null,
      conflicts: [],
    });
  }

  for (const [sourceModule, rows] of Object.entries(moduleRowsByModule ?? {})) {
    const targetModule = MODULE_COLUMNS.includes(sourceModule) ? sourceModule : null;
    if (targetModule === null) continue;
    applyModuleRows(updatesByUser, rows, targetModule);
  }

  for (const row of dynamicRows ?? []) {
    const user = updatesByUser.get(normalizeKey(row.user_id));
    if (user === undefined) continue;
    const module = normalizeKey(row.modulo);
    if (module !== "workspace" || normalizeKey(row.referencia) !== "0") continue;
    applyModuleValue(user, "ti", row.nivel, user.department === "tecnologia");
  }

  return [...updatesByUser.values()];
}

function applyModuleRows(updatesByUser, rows, targetModule) {
  for (const row of rows ?? []) {
    const user = updatesByUser.get(normalizeKey(row.user_id));
    if (user === undefined) continue;
    applyModuleValue(user, targetModule, row.permissao, user.department === targetModule);
  }
}

function applyModuleValue(user, targetModule, value, exceptionalDepartment) {
  const mapped = mapLegacyModuleLevel(value, { exceptionalDepartment });
  if (mapped === null) {
    user.conflicts.push({ targetModule, legacyValue: value, reason: "INVALID_LEVEL" });
    return;
  }
  const current = user.modules[targetModule];
  if (current !== 0 && current !== mapped) {
    user.conflicts.push({ targetModule, previous: current, next: mapped, reason: "CONFLICT" });
  }
  user.modules[targetModule] = Math.max(current, mapped);
}

function parseLegacyLevel(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 2 ? value : null;
  }
  if (typeof value !== "string" || !/^[012]$/.test(value.trim())) return null;
  return Number(value.trim());
}

function normalizeKey(value) {
  if (value === null || value === undefined) return null;
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, "_");
}
