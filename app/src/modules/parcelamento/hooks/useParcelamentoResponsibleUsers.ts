import type { UseQueryResult } from "@tanstack/react-query";

import { useAssignableUsers } from "@modules/rh";

import type { ParcelamentoResponsibleUser } from "../types";

interface UseParcelamentoResponsibleUsersOptions {
  enabled?: boolean;
}

// Catálogo enxuto do RH (usuários com acesso ao módulo), sem paginar todos os usuários (#1349).
export function useParcelamentoResponsibleUsers(
  options?: UseParcelamentoResponsibleUsersOptions,
): UseQueryResult<ParcelamentoResponsibleUser[], Error> {
  return useAssignableUsers({ module: "parcelamento", enabled: options?.enabled ?? true });
}
