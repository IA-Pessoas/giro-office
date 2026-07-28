import { useEffect, useMemo } from "react";

import { useAuth } from "@/context/AuthContext";

import {
  getAccessStoreState,
  resetAccessStoreState,
  setAccessStoreState,
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

    const currentState = getAccessStoreState();
    const shouldSync =
      !currentState.isInitialized ||
      currentState.user?.id !== nextState.user?.id ||
      currentState.user?.permission !== nextState.user?.permission ||
      currentState.user?.department_id !== nextState.user?.department_id ||
      currentState.user?.modules !== nextState.user?.modules ||
      currentState.departmentName !== nextState.departmentName ||
      currentState.departmentModule !== nextState.departmentModule ||
      currentState.isLoading !== nextState.isLoading ||
      currentState.error !== nextState.error ||
      currentState.accessMap !== nextState.accessMap;

    if (shouldSync) {
      setAccessStoreState(nextState);
    }
  }, [nextState, user]);
}
