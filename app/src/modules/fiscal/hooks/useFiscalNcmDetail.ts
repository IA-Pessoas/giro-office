import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { fiscalNcmService } from "../services";
import type { FiscalNcm } from "../types";
import { fiscalNcmDetailQueryKey } from "./queryKeys";

export function useFiscalNcmDetail(
  ncmId?: string | null,
  enabled = true,
): UseQueryResult<FiscalNcm, Error> {
  return useFetch(
    fiscalNcmDetailQueryKey(ncmId),
    () => fiscalNcmService.detail(ncmId ?? ""),
    {
      enabled: enabled && Boolean(ncmId),
    },
  );
}
