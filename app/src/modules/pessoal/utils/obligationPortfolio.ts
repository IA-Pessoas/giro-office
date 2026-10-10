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

export function obligationItemValue(state: PessoalObligationItemState): boolean | null {
  if (state === "none") return null;
  return state === "done";
}
