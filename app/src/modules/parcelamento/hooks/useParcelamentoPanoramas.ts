import { useFetch } from "@shared/hooks";

import { parcelamentoService } from "../services";
import type { ParcelamentoListFilters } from "../types";
import { parcelamentoQueryKey } from "./queryKeys";

interface ParcelamentoQueryOptions {
  enabled?: boolean;
}

export function parcelamentoPanoramasQueryKey(filters: ParcelamentoListFilters) {
  return parcelamentoQueryKey("panoramas", filters);
}

export function useParcelamentoPanoramas(
  filters: ParcelamentoListFilters,
  options: ParcelamentoQueryOptions = {},
) {
  return useFetch(
    parcelamentoPanoramasQueryKey(filters),
    () => parcelamentoService.listPanoramas(filters),
    {
      enabled: options.enabled ?? true,
      placeholderData: (previousData) => previousData,
    },
  );
}
