import {
  normalizeTriageDocumentStatus,
  TRIAGE_FISCAL_CHECKLIST_FIELDS,
  TRIAGE_PENDING_DOCUMENT_STATUSES,
} from "@workspace/shared";

/**
 * Leitura do estado documental da Triagem Fiscal para o controle mensal. Só lê: o
 * recebimento continua sendo da Triagem (contabil-service) e concluir o Fiscal não o altera.
 *
 * Pendência e campos vêm do shared, os mesmos da Triagem (TRIAGE_PENDING_DOCUMENT_STATUSES).
 */
const PENDING = new Set<string>(TRIAGE_PENDING_DOCUMENT_STATUSES);
// Só os itens da rotina fiscal, como a própria Triagem lê o checklist.
const FISCAL_FIELDS = new Set<string>(TRIAGE_FISCAL_CHECKLIST_FIELDS);

export type TriageDocumentsSource = "MONTHLY" | "PLANNED" | "NONE";

export interface TriageDocumentsView {
  /** MONTHLY: rotina mensal iniciada; PLANNED: só a competência planejada; NONE: nada. */
  source: TriageDocumentsSource;
  /** null quando não há registro na Triagem: nada confirma que os documentos chegaram. */
  pending: number | null;
  items: Array<{ field: string; status: string }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Itens obrigatórios da rotina fiscal no snapshot da competência (formato da Triagem). */
function plannedFields(configurationSnapshot: unknown): string[] {
  const configs = asRecord(configurationSnapshot).configs;
  const fiscal = Array.isArray(configs)
    ? configs.find((config) => asRecord(config).type === "FISCAL")
    : undefined;
  const activeItems = asRecord(fiscal).active_items;
  if (!Array.isArray(activeItems)) return [];
  return activeItems.flatMap((item) => {
    if (typeof item === "string") return FISCAL_FIELDS.has(item) ? [item] : [];
    const record = asRecord(item);
    return typeof record.field === "string" &&
      FISCAL_FIELDS.has(record.field) &&
      record.required !== false
      ? [record.field]
      : [];
  });
}

export function triageDocumentsView(
  monthly: { checklist: unknown } | undefined,
  competence: { configuration_snapshot: unknown } | undefined,
): TriageDocumentsView {
  if (monthly) {
    // Mesmo mapeamento de estados da Triagem, inclusive os gravados pelo legado.
    const items = Object.entries(asRecord(monthly.checklist)).flatMap(([field, value]) => {
      const status = normalizeTriageDocumentStatus(value);
      return FISCAL_FIELDS.has(field) && status ? [{ field, status }] : [];
    });
    return {
      source: "MONTHLY",
      pending: items.filter((item) => PENDING.has(item.status)).length,
      items,
    };
  }
  if (competence) {
    const items = plannedFields(competence.configuration_snapshot).map((field) => ({
      field,
      status: "PENDING",
    }));
    return { source: "PLANNED", pending: items.length, items };
  }
  return { source: "NONE", pending: null, items: [] };
}

/** Concluir com pendência (ou sem registro na Triagem) é conclusão excepcional. */
export function hasTriagePendency(view: Pick<TriageDocumentsView, "pending">): boolean {
  return view.pending !== 0;
}
