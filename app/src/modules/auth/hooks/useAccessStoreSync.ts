import { useEffect, useMemo } from "react";

import { useAuth } from "@/context/AuthContext";

import {
  getAccessStoreState,
  resetAccessStoreState,
  setAccessStoreState,
  shouldSyncAccessStore,
} from "../store/accessStore";
import { useModuleAccessMap } from "./useModuleAccess";
import { MODULE_KEYS } from "../utils/moduleAccess";

export function useAccessStoreSync() {
  const { user } = useAuth();
  const { accessMap, departmentName, departmentModule, isLoading, departmentsQuery } =
    useModuleAccessMap(MODULE_KEYS);

  const nextState = useMemo(
    () => ({
      user: user
        ? {
            id: user.id,
            permission: user.permission,
            department_id: user.department_id,
            organization_id: user.organization_id,
            modules: user.modules,
          }
        : null,
      departmentName,
      departmentModule,
      accessMap,
      isLoading,
      error: departmentsQuery.error ?? null,
      isInitialized: true,
    }),
    [accessMap, departmentModule, departmentName, departmentsQuery.error, isLoading, user],
  );

  useEffect(() => {
    if (!user) {
      resetAccessStoreState();
      return;
    }

    if (shouldSyncAccessStore(getAccessStoreState(), nextState)) {
      setAccessStoreState(nextState);
    }
  }, [nextState, user]);
}
