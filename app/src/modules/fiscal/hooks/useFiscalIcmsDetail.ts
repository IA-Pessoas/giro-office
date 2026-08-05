import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { fiscalIcmsService } from "../services";
import type { FiscalIcms } from "../types";
import { fiscalIcmsDetailQueryKey } from "./queryKeys";

export function useFiscalIcmsDetail(
  icmsId?: string | null,
  enabled = true,
): UseQueryResult<FiscalIcms, Error> {
  return useFetch(
    fiscalIcmsDetailQueryKey(icmsId),
    () => fiscalIcmsService.detail(icmsId ?? ""),
    {
      enabled: enabled && Boolean(icmsId),
    },
  );
}
