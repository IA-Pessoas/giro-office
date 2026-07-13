import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";
import { listAdminUsers, normalizeAdminUserStatus } from "@modules/users";

import { RH_QUERY_KEY } from "./useRhRequests";
import type { AssignableUser } from "../types";

interface UseAssignableUsersOptions {
  enabled?: boolean;
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
      const users = await listAdminUsers("active");

      return users.map<AssignableUser>((user) => ({
        id: user.id,
        name: user.name,
        status: normalizeAdminUserStatus(user.status),
        departmentName: user.department?.name ?? null,
        photoUrl: user.photo_url ?? user.photo ?? null,
      }));
    },
    {
      enabled: options?.enabled ?? true,
    },
  );
}
