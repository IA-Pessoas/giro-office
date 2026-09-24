import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { platformService } from "../services/platformService";
import type { PlatformSuperAdmin } from "../types";

export function usePlatformSuperAdmins(): UseQueryResult<PlatformSuperAdmin[]> {
  return useQuery({
    queryKey: ["platform", "super-admins"],
    queryFn: () => platformService.listSuperAdmins(),
    staleTime: 15_000,
  });
}
