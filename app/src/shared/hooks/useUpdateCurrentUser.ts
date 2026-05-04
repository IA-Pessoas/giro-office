import type { MeSessionUser, UpdateCurrentUserPayload } from "@workspace/api";
import type { UseMutationResult } from "@tanstack/react-query";

import { useUpdateMe } from "./useMeMutations";

export function useUpdateCurrentUser(): UseMutationResult<
  MeSessionUser,
  unknown,
  UpdateCurrentUserPayload,
  unknown
> {
  return useUpdateMe();
}
