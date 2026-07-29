import type { UseQueryResult } from "@tanstack/react-query";

import { setupAPIClient } from "@shared/services/api";
import { useFetch } from "@shared/hooks";

import { RH_QUERY_KEY } from "./useRhRequests";
import { RH_ENDPOINTS, unwrapRhEnvelope } from "../services/rhService.contract";
import type { AssignableUser } from "../types";

interface UseAssignableUsersOptions {
  enabled?: boolean;
}

interface RhOperationalUser {
  id: string;
  name: string;
  status: string | null;
  department: string | null;
}

export function assignableUsersQueryKey() {
  return [...RH_QUERY_KEY, "assignable-users", "active"] as const;
}

export function useAssignableUsers(
  options?: UseAssignableUsersOptions,
): UseQueryResult<AssignableUser[], Error> {
  return useFetch(
    assignableUsersQueryKey(),
    async () => {
      const api = setupAPIClient();
      const response = await api.get(RH_ENDPOINTS.operationalUsers);
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
