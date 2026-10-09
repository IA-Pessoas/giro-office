export type FiscalAnticipationIssueKind = "error" | "discarded" | "duplicate";

export const FISCAL_ANTICIPATION_ISSUE_LABELS: Record<FiscalAnticipationIssueKind, string> = {
  error: "Erro",
  discarded: "Descartado",
  duplicate: "Duplicata",
};

export type FiscalAnticipationStatus = "pending_review" | "awaiting_check" | "checked";
export type FiscalAnticipationClassification = "partial" | "total" | "freight";
export type FiscalAnticipationCorrectableField =
  | "ncm"
  | "cfop"
  | "quantity"
  | "value"
  | "ipi"
  | "icms_st";

export const FISCAL_ANTICIPATION_STATUS_LABELS: Record<FiscalAnticipationStatus, string> = {
  pending_review: "Em classificação",
  awaiting_check: "Aguardando conferência",
  checked: "Conferido",
};

export const FISCAL_ANTICIPATION_CLASSIFICATION_LABELS: Record<
  FiscalAnticipationClassification,
  string
> = {
  partial: "Parcial",
  total: "Total",
  freight: "Frete",
};

export const FISCAL_ANTICIPATION_FIELD_LABELS: Record<FiscalAnticipationCorrectableField, string> = {
  ncm: "NCM",
  cfop: "CFOP",
  quantity: "Quantidade",
  value: "Valor",
  ipi: "IPI",
  icms_st: "ICMS ST",
};

/** Rótulo do campo do histórico: "correction.ncm" → "Correção de NCM". */
export function formatAnticipationHistoryField(field: string): string {
  if (field.startsWith("correction.")) {
    const name = field.slice("correction.".length) as FiscalAnticipationCorrectableField;
    return `Correção de ${FISCAL_ANTICIPATION_FIELD_LABELS[name] ?? name}`;
  }
  const labels: Record<string, string> = {
    classification: "Classificação",
    manual_value: "Valor manual",
    status: "Estado do lote",
    reviewer_id: "Conferente",
  };
  return labels[field] ?? field;
}

/** Valor do histórico legível: estados e classificações pelos rótulos, vazio como "—". */
export function formatAnticipationHistoryValue(
  field: string,
  value: string | null,
  userName: (id: string) => string | undefined,
): string {
  if (value === null) return "—";
  if (field === "status") {
    return FISCAL_ANTICIPATION_STATUS_LABELS[value as FiscalAnticipationStatus] ?? value;
  }
  if (field === "classification") {
    return (
      FISCAL_ANTICIPATION_CLASSIFICATION_LABELS[value as FiscalAnticipationClassification] ?? value
    );
  }
  if (field === "reviewer_id") return userName(value) ?? "Usuário sem acesso atual";
  return value;
}

export type FiscalAnticipationItemChanges = {
  classification?: FiscalAnticipationClassification | null;
  manual_value?: string | null;
  corrections?: Partial<Record<FiscalAnticipationCorrectableField, string | null>>;
};

/**
 * Número digitado ("1.234,5", "150", "9,90") no formato canônico do serviço: ponto decimal,
 * dinheiro com 2 casas e quantidade sem zeros à direita. Texto que não é número volta como está,
 * para o serviço recusar com a mensagem de validação.
 */
function canonicalNumber(raw: string, kind: "money" | "quantity"): string {
  const text = raw.includes(",") ? raw.replace(/\./gu, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d+)?$/u.test(text)) return raw;
  const [integer = "0", fraction = ""] = text.split(".");
  const digits = integer.replace(/^0+(?=\d)/u, "");
  if (kind === "money") return `${digits}.${fraction.padEnd(2, "0")}`;
  const trimmed = fraction.replace(/0+$/u, "");
  return trimmed ? `${digits}.${trimmed}` : digits;
}

function canonicalField(field: FiscalAnticipationCorrectableField, raw: string): string {
  if (field === "ncm" || field === "cfop") return raw;
  return canonicalNumber(raw, field === "quantity" ? "quantity" : "money");
}

/**
 * Alterações do formulário de revisão em relação ao item: só os campos mudados vão ao serviço,
 * texto vazio desfaz (null). Devolve null quando nada mudou.
 */
export function buildAnticipationItemChanges(
  item: {
    classification: FiscalAnticipationClassification | null;
    manual_value: string | null;
    corrections: Partial<Record<FiscalAnticipationCorrectableField, string>>;
  },
  form: {
    classification: FiscalAnticipationClassification | "";
    manual_value: string;
    corrections: Partial<Record<FiscalAnticipationCorrectableField, string>>;
  },
): FiscalAnticipationItemChanges | null {
  const changes: FiscalAnticipationItemChanges = {};
  const classification = form.classification || null;
  if (classification !== item.classification) changes.classification = classification;
  const manualText = form.manual_value.trim();
  const manualValue = manualText ? canonicalNumber(manualText, "money") : null;
  if (manualValue !== item.manual_value) changes.manual_value = manualValue;
  const corrections: NonNullable<FiscalAnticipationItemChanges["corrections"]> = {};
  for (const [field, raw] of Object.entries(form.corrections) as [
    FiscalAnticipationCorrectableField,
    string,
  ][]) {
    const text = raw.trim();
    const next = text ? canonicalField(field, text) : null;
    if (next !== (item.corrections[field] ?? null)) corrections[field] = next;
  }
  if (Object.keys(corrections).length) changes.corrections = corrections;
  return Object.keys(changes).length ? changes : null;
}

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
