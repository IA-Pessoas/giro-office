import type { UseQueryResult } from "@tanstack/react-query";

import type { ModuleKey } from "@modules/auth";
import { setupAPIClient } from "@shared/services/api";
import { useFetch } from "@shared/hooks";

import { RH_QUERY_KEY } from "./useRhRequests";
import { RH_ENDPOINTS, unwrapRhEnvelope } from "../services/rhService.contract";
import type { AssignableUser } from "../types";

export interface UseAssignableUsersOptions {
  enabled?: boolean;
  module?: ModuleKey;
  departmentId?: string;
  departmentName?: string;
}

interface RhOperationalUser {
  id: string;
  name: string;
  status: string | null;
  department: string | null;
}

export function assignableUsersQueryKey(options: UseAssignableUsersOptions = {}) {
  return [
    ...RH_QUERY_KEY,
    "assignable-users",
    "active",
    options.module ?? null,
    options.departmentId ?? null,
    options.departmentName ?? null,
  ] as const;
}

export function useAssignableUsers(
  options?: UseAssignableUsersOptions,
): UseQueryResult<AssignableUser[], Error> {
  return useFetch(
    assignableUsersQueryKey(options),
    async () => {
      const api = setupAPIClient();
      const response = await api.get(RH_ENDPOINTS.operationalUsers, {
        params: {
          module: options?.module,
          department_id: options?.departmentId,
          department_name: options?.departmentName,
        },
      });
      const users = unwrapRhEnvelope<RhOperationalUser[]>(response.data);

      return users.map<AssignableUser>((user) => ({
        id: user.id,
        name: user.name,
        status: user.status,
        departmentName: user.department,
        photoUrl: null,
      }));
    },
    {
      enabled: options?.enabled ?? true,
    },
  );
}
