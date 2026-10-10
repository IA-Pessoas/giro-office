import type { PessoalObligationItemState } from "../types/obligations";

export const PESSOAL_OBLIGATION_STATE_LABELS: Record<PessoalObligationItemState, string> = {
  pending: "Pendente",
  done: "Concluído",
  none: "Não possui",
};

export function obligationItemState(value: boolean | null): PessoalObligationItemState {
  if (value === null) return "none";
  return value ? "done" : "pending";
}

/** Valor de uma mudança do histórico: estado do item ou nome do responsável. */
export function formatObligationHistoryValue(
  field: string,
  value: boolean | string | null,
  userNames: ReadonlyMap<string, string>,
): string {
  if (field === "responsavel_id") {
    return typeof value === "string" ? (userNames.get(value) ?? "Outro responsável") : "Sem responsável";
  }
  return PESSOAL_OBLIGATION_STATE_LABELS[obligationItemState(value === null ? null : value === true)];
}

export function obligationItemValue(state: PessoalObligationItemState): boolean | null {
  if (state === "none") return null;
  return state === "done";
}
