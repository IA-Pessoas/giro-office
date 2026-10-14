import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiAccessLogsService } from "../services";
import type { TiAccessLogList, TiId } from "../types";
import { tiQueryKeys } from "./queryKeys";

export function useTiAccessLogs(
  userId: TiId | undefined,
  page: number,
): UseQueryResult<TiAccessLogList, Error> {
  return useFetch(
    tiQueryKeys.accessLogs(userId, page),
    () => tiAccessLogsService.listUserAccessLogs(userId as TiId, page),
    {
      enabled: Boolean(userId),
      // Troca de página mantém a tabela; troca de usuário não mostra acessos de outro.
      placeholderData: (previous) => (previous?.user.id === userId ? previous : undefined),
    },
  );
}
