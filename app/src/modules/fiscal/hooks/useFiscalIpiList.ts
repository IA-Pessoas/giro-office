import { keepPreviousData, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { fiscalIpiService } from "../services";
import type { FiscalIpi } from "../types";
import { fiscalIpiListQueryKey } from "./queryKeys";

export function useFiscalIpiList(
  ipiCodes: string[],
  enabled = true,
): UseQueryResult<FiscalIpi[], Error> {
  return useFetch(
    fiscalIpiListQueryKey(ipiCodes),
    () => fiscalIpiService.list({ ipiCodes }),
    {
      enabled: enabled && ipiCodes.length > 0,
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: false,
    },
  );
}
