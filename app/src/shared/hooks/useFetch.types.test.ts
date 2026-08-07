import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "./useFetch";

type FullUser = { id: string; name: string; email: string };
type UserPreview = Pick<FullUser, "id" | "name">;

/**
 * Compile-time only: ensures `useFetch` forwards `select` so `TData` differs from `TQueryFnData`.
 * Run: `pnpm exec tsc -p tsconfig.usefetch-types.json --noEmit` from the app package.
 */
function assertUseFetchSelectTypes(): UseQueryResult<UserPreview, Error> {
  return useFetch<FullUser, Error, UserPreview, readonly ["useFetch-type-test", string]>(
    ["useFetch-type-test", "x"],
    async () => ({ id: "1", name: "n", email: "e@e.com" }),
    {
      select: (u): UserPreview => ({ id: u.id, name: u.name }),
    },
  );
}

void assertUseFetchSelectTypes;