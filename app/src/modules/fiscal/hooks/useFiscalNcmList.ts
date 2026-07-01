import { keepPreviousData, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { fiscalNcmService } from "../services";
import type { FiscalNcm } from "../types";
import { fiscalNcmListQueryKey } from "./queryKeys";

export function useFiscalNcmList(
  ncmCodes: string[],
  enabled = true,
): UseQueryResult<FiscalNcm[], Error> {
  return useFetch(
    fiscalNcmListQueryKey(ncmCodes),
    () => fiscalNcmService.list({ ncmCodes }),
    {
      enabled: enabled && ncmCodes.length > 0,
      placeholderData: keepPreviousData,
    },
  );
}
