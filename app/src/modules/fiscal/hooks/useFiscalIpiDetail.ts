import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { fiscalIpiService } from "../services";
import type { FiscalIpi } from "../types";
import { fiscalIpiDetailQueryKey } from "./queryKeys";

export function useFiscalIpiDetail(
  ipiId?: string | null,
  enabled = true,
): UseQueryResult<FiscalIpi, Error> {
  return useFetch(
    fiscalIpiDetailQueryKey(ipiId),
    () => fiscalIpiService.detail(ipiId ?? ""),
    {
      enabled: enabled && Boolean(ipiId),
    },
  );
}
