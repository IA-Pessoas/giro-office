import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";
import { userService } from "@modules/users";

import { RH_QUERY_KEY } from "./useRhRequests";
import type { AssignableUser } from "../types";
import { normalizeAssignableUserStatus } from "../utils/rhAssignableUsers";

const ASSIGNABLE_USERS_PAGE_SIZE = 100;

interface UseAssignableUsersOptions {
  enabled?: boolean;
}

export function assignableUsersQueryKey() {
  return [...RH_QUERY_KEY, "assignable-users", ASSIGNABLE_USERS_PAGE_SIZE] as const;
}

export function useAssignableUsers(
  options?: UseAssignableUsersOptions,
): UseQueryResult<AssignableUser[], Error> {
  return useFetch(
    assignableUsersQueryKey(),
    async () => {
      const page = await userService.listPage({
        skip: 0,
        take: ASSIGNABLE_USERS_PAGE_SIZE,
      });

      return page.users
        .filter((user) => normalizeAssignableUserStatus(user.status) === "active")
        .map<AssignableUser>((user) => ({
          id: user.id,
          name: user.name,
          permission: typeof user.permission === "number" ? user.permission : null,
          status: normalizeAssignableUserStatus(user.status),
          departmentName: user.department?.name ?? null,
          modules: user.modules ?? null,
          photoUrl: user.photo_url ?? user.photo ?? null,
        }));
    },
    {
      enabled: options?.enabled ?? true,
      refetchOnWindowFocus: false,
    },
  );
}
