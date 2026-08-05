import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { pessoalService } from "../services/pessoalService";
import type { PessoalOverviewSummary } from "../types";
import { pessoalQueryKey } from "./queryKeys";

export function usePessoalOverview(): UseQueryResult<PessoalOverviewSummary, Error> {
  return useFetch(pessoalQueryKey("overview"), () => pessoalService.getOverview());
}
