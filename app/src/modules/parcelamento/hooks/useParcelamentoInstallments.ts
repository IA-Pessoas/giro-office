import { useFetch } from "@shared/hooks";

import { parcelamentoService } from "../services";
import type { ParcelamentoListFilters } from "../types";
import { parcelamentoQueryKey } from "./queryKeys";

interface ParcelamentoQueryOptions {
  enabled?: boolean;
}

export function parcelamentoInstallmentsQueryKey(filters: ParcelamentoListFilters) {
  return parcelamentoQueryKey("installments", filters);
}

export function useParcelamentoInstallments(
  filters: ParcelamentoListFilters,
  options: ParcelamentoQueryOptions = {},
) {
  return useFetch(
    parcelamentoInstallmentsQueryKey(filters),
    () => parcelamentoService.listInstallments(filters),
    {
      enabled: options.enabled ?? true,
      placeholderData: (previousData) => previousData,
    },
  );
}
