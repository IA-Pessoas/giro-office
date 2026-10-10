import { ServiceError } from "@workspace/shared";

// Estados do legado; NULL é "não selecionado". Texto livre migrado continua legível,
// mas só pode ser mantido como está ou trocado por um destes estados.
export const CONTABIL_CHART_ACCOUNTS_OPTIONS = [
  "Sim",
  "Não",
  "Sim — Jonrick",
  "Não — Jonrick",
] as const;

export function assertChartAccountsState(next: string | null | undefined, current?: string | null) {
  if (next === undefined || next === null || next === current) return;
  if (!(CONTABIL_CHART_ACCOUNTS_OPTIONS as readonly string[]).includes(next)) {
    throw new ServiceError(400, "Plano de contas inválido.");
  }
}
