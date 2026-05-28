import { useMemo } from "react";

import { useAuth } from "@/context/AuthContext";
import { departmentService } from "@modules/departments";
import { useFetch } from "@shared/hooks";
import {
  MODULE_KEYS,
  resolveAccessLevelFromAdditionalPermission,
  resolveDepartmentModuleKey,
  resolveModuleAccess,
  type ModuleAccess,
  type ModuleKey,
} from "../utils/moduleAccess";

type ModuleAccessMap = Record<ModuleKey, ModuleAccess>;

function createEmptyModuleAccessMap(): ModuleAccessMap {
  return MODULE_KEYS.reduce<ModuleAccessMap>((acc, moduleKey) => {
    acc[moduleKey] = resolveModuleAccess({ module: moduleKey });
    return acc;
  }, {} as ModuleAccessMap);
}

export function useModuleAccessMap(moduleKeys: readonly ModuleKey[] = MODULE_KEYS) {
  const { user } = useAuth();
  const departmentsQuery = useFetch(
    ["module-access", "departments"],
    () => departmentService.list(),
    {
      enabled: Boolean(user?.department_id),
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  const departmentName = useMemo(() => {
    if (!user?.department_id) {
      return null;
    }

    return (
      departmentsQuery.data?.find((department) => department.id === user.department_id)?.name ?? null
    );
  }, [departmentsQuery.data, user?.department_id]);

  const departmentModule = useMemo(
    () => resolveDepartmentModuleKey(departmentName),
    [departmentName],
  );

  const accessMap = useMemo(() => {
    const nextMap = createEmptyModuleAccessMap();

    for (const moduleKey of moduleKeys) {
      nextMap[moduleKey] = resolveModuleAccess({
        userPermission: user?.permission,
        departmentModule,
        module: moduleKey,
        additionalModulePermissions: user?.modules ?? null,
      });
    }

    return nextMap;
  }, [departmentModule, moduleKeys, user?.modules, user?.permission]);

  const hasImmediateAccessSource = useMemo(() => {
    if (user?.permission === 2) {
      return true;
    }

    return moduleKeys.some((moduleKey) => {
      return resolveAccessLevelFromAdditionalPermission(user?.modules?.[moduleKey]) !== "none";
    });
  }, [moduleKeys, user?.modules, user?.permission]);

  return {
    accessMap,
    departmentName,
    departmentModule,
    isLoading:
      Boolean(user?.department_id) &&
      departmentsQuery.isLoading &&
      !hasImmediateAccessSource &&
      user?.permission !== 2,
    departmentsQuery,
    user,
  };
}

export function useModuleAccess(moduleKey: ModuleKey) {
  const { accessMap, ...rest } = useModuleAccessMap([moduleKey]);

  return {
    access: accessMap[moduleKey],
    ...rest,
  };
}
