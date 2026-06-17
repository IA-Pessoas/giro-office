export const RH_SELF_SERVICE_PERMISSION = 1;
export const RH_MANAGEMENT_PERMISSION = 2;

export type CreateUserModuleLevel = 0 | 1 | 2;
export type CreateUserModuleSelectValue = "none" | "0" | "1" | "2";

export interface CreateUserModuleSelection {
  enabled: boolean;
  level: CreateUserModuleLevel;
}

export type CreateUserModuleSelections<TModuleKey extends string = string> = Record<
  TModuleKey,
  CreateUserModuleSelection
>;

export function getModuleSelectValue(
  selection: CreateUserModuleSelection,
): CreateUserModuleSelectValue {
  if (!selection.enabled) {
    return "none";
  }

  return String(selection.level) as Exclude<CreateUserModuleSelectValue, "none">;
}

export function resolveCreateUserRhModuleLevel({
  departmentModuleKey,
  selectedRhLevel,
}: {
  departmentModuleKey?: string | null;
  selectedRhLevel?: number | null;
}): typeof RH_SELF_SERVICE_PERMISSION | typeof RH_MANAGEMENT_PERMISSION {
  if (departmentModuleKey === "rh") {
    return RH_MANAGEMENT_PERMISSION;
  }

  if (typeof selectedRhLevel === "number" && selectedRhLevel >= RH_MANAGEMENT_PERMISSION) {
    return RH_MANAGEMENT_PERMISSION;
  }

  return RH_SELF_SERVICE_PERMISSION;
}

export function buildCreateUserModulesPayload<TModuleKey extends string>(
  moduleSelections: CreateUserModuleSelections<TModuleKey>,
  departmentModuleKey?: TModuleKey | null,
): Record<string, number | null> {
  const payload = Object.entries(moduleSelections).reduce<Record<string, number | null>>(
    (acc, [key, rawConfig]) => {
      const config = rawConfig as CreateUserModuleSelection;

      if (key === "rh") {
        return acc;
      }

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

  const rhSelection = moduleSelections["rh" as TModuleKey];
  payload.rh = resolveCreateUserRhModuleLevel({
    departmentModuleKey,
    selectedRhLevel: rhSelection?.enabled ? rhSelection.level : null,
  });

  return payload;
}
