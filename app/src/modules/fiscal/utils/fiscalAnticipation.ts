export type FiscalAnticipationIssueKind = "error" | "discarded" | "duplicate";

export const FISCAL_ANTICIPATION_ISSUE_LABELS: Record<FiscalAnticipationIssueKind, string> = {
  error: "Erro",
  discarded: "Descartado",
  duplicate: "Duplicata",
};

export const FISCAL_ANTICIPATION_STATUS_LABELS = {
  pending_review: "Pendente de revisão",
} as const;

/** Resumo do lote: o que entrou e o que ficou de fora, sem esconder duplicatas e erros. */
export function formatAnticipationSummary(batch: {
  entry_count: number;
  note_count: number;
  item_count: number;
  issues: { kind: FiscalAnticipationIssueKind }[];
}): string {
  const count = (kind: FiscalAnticipationIssueKind) =>
    batch.issues.filter((issue) => issue.kind === kind).length;
  const outside = [
    [count("duplicate"), "duplicata(s)"],
    [count("error"), "erro(s)"],
    [count("discarded"), "descarte(s)"],
  ]
    .filter(([total]) => Number(total) > 0)
    .map(([total, label]) => `${total} ${label}`);
  const imported = `${batch.item_count} item(ns) de ${batch.note_count} nota(s), ${batch.entry_count} arquivo(s) no ZIP`;
  return outside.length ? `${imported}; fora do lote: ${outside.join(", ")}` : imported;
}
