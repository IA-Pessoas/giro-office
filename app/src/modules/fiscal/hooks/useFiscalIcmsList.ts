import { keepPreviousData, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { fiscalIcmsService } from "../services";
import type { FiscalIcms } from "../types";
import { fiscalIcmsListQueryKey } from "./queryKeys";

export function useFiscalIcmsList(
  icmsTerms: string[],
  enabled = true,
): UseQueryResult<FiscalIcms[], Error> {
  return useFetch(
    fiscalIcmsListQueryKey(icmsTerms),
    () => fiscalIcmsService.list({ icmsCodes: icmsTerms }),
    {
      enabled: enabled && icmsTerms.length > 0,
      placeholderData: keepPreviousData,
    },
  );
}
