import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { commercialService } from "../services/commercialService";
import type { CommercialOverview } from "../types";
import { commercialQueryKeys } from "./queryKeys";

export function useCommercialOverview(): UseQueryResult<CommercialOverview, Error> {
  return useFetch(commercialQueryKeys.overview(), () => commercialService.getOverview());
}
