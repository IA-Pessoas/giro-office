import { keepPreviousData, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiChangeHistoryService } from "../services";
import type { TiChangeHistoryItemType, TiChangeHistoryList } from "../types";
import { tiQueryKeys } from "./queryKeys";

export function useTiChangeHistory(
  itemType: TiChangeHistoryItemType | undefined,
  page: number,
): UseQueryResult<TiChangeHistoryList, Error> {
  return useFetch(
    tiQueryKeys.changeHistory(itemType, page),
    () => tiChangeHistoryService.listChangeHistory(itemType, page),
    // Troca de página ou de filtro mantém a tabela enquanto a nova página carrega.
    { placeholderData: keepPreviousData },
  );
}
