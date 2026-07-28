import { create } from "zustand";

import {
  MODULE_KEYS,
  resolveModuleAccess,
  type ModuleAccess,
  type ModuleKey,
} from "../utils/moduleAccess";

type AccessStoreUser = {
  id: string;
  permission: number;
  department_id?: string;
  organization_id?: string | null;
  modules?: Record<string, number>;
} | null;

type ModuleAccessMap = Record<ModuleKey, ModuleAccess>;

export interface AccessStoreState {
  user: AccessStoreUser;
  departmentName: string | null;
  departmentModule: ModuleKey | null;
  accessMap: ModuleAccessMap;
  isLoading: boolean;
  error: Error | null;
  isInitialized: boolean;
}

function createEmptyAccessMap(): ModuleAccessMap {
  return MODULE_KEYS.reduce<ModuleAccessMap>((acc, moduleKey) => {
    acc[moduleKey] = resolveModuleAccess({ module: moduleKey });
    return acc;
  }, {} as ModuleAccessMap);
}

const INITIAL_ACCESS_STORE_STATE: AccessStoreState = {
  user: null,
  departmentName: null,
  departmentModule: null,
  accessMap: createEmptyAccessMap(),
  isLoading: false,
  error: null,
  isInitialized: false,
};

type AccessStoreActions = {
  setSnapshot: (nextState: AccessStoreState) => void;
  resetSnapshot: () => void;
};

type AccessStoreSnapshot = AccessStoreState & AccessStoreActions;

export function shouldSyncAccessStore(
  currentState: AccessStoreState,
  nextState: AccessStoreState,
): boolean {
  return (
    !currentState.isInitialized ||
    currentState.user?.id !== nextState.user?.id ||
    currentState.user?.permission !== nextState.user?.permission ||
    currentState.user?.department_id !== nextState.user?.department_id ||
    currentState.user?.organization_id !== nextState.user?.organization_id ||
    currentState.user?.modules !== nextState.user?.modules ||
    currentState.departmentName !== nextState.departmentName ||
    currentState.departmentModule !== nextState.departmentModule ||
    currentState.isLoading !== nextState.isLoading ||
    currentState.error !== nextState.error ||
    currentState.accessMap !== nextState.accessMap
  );
}

export const useAccessStore = create<AccessStoreSnapshot>((set) => ({
  ...INITIAL_ACCESS_STORE_STATE,
  setSnapshot: (nextState) => set(() => nextState),
  resetSnapshot: () => set(() => INITIAL_ACCESS_STORE_STATE),
}));

export function getAccessStoreState(): AccessStoreState {
  const { setSnapshot, resetSnapshot, ...snapshot } = useAccessStore.getState();
  void setSnapshot;
  void resetSnapshot;
  return snapshot;
}

export function setAccessStoreState(nextState: AccessStoreState) {
  useAccessStore.getState().setSnapshot(nextState);
}

export function resetAccessStoreState() {
  useAccessStore.getState().resetSnapshot();
}
