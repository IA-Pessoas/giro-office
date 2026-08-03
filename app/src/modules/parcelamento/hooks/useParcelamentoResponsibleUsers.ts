import type { UseQueryResult } from "@tanstack/react-query";

import { isAdminPermission, resolveDepartmentModuleKey } from "@modules/auth";
import { listAdminUsers, type UserItem } from "@modules/users";
import { useFetch } from "@shared/hooks";

import type { ParcelamentoResponsibleUser } from "../types";
import { parcelamentoQueryKey } from "./queryKeys";

interface UseParcelamentoResponsibleUsersOptions {
  enabled?: boolean;
}

function isParcelamentoResponsibleCandidate(user: UserItem): boolean {
  return (
    user.type === "owner" ||
    user.type === "admin" ||
    isAdminPermission(user.permission) ||
    resolveDepartmentModuleKey(user.department?.name ?? null) === "parcelamento"
  );
}

export function parcelamentoResponsibleUsersQueryKey() {
  return parcelamentoQueryKey("responsible-users", "active");
}

export function useParcelamentoResponsibleUsers(
  options?: UseParcelamentoResponsibleUsersOptions,
): UseQueryResult<ParcelamentoResponsibleUser[], Error> {
  return useFetch(
    parcelamentoResponsibleUsersQueryKey(),
    async () => {
      const users = await listAdminUsers("active");

      return users
        .filter(isParcelamentoResponsibleCandidate)
        .map<ParcelamentoResponsibleUser>((user) => ({
          id: user.id,
          name: user.name,
        }))
        .sort((firstUser, secondUser) => firstUser.name.localeCompare(secondUser.name, "pt-BR"));
    },
    {
      enabled: options?.enabled ?? true,
    },
  );
}
