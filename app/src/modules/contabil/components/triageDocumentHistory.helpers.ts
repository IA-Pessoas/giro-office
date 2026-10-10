import type { TriageDocumentHistoryEntry, TriageDocumentStatus } from "../types";
import { CONTABIL_DOCUMENTS, FISCAL_DOCUMENTS, STATUS_LABELS } from "./triageDocumentLabels.ts";

const ITEM_LABELS = new Map<string, string>([
  ...CONTABIL_DOCUMENTS,
  ...FISCAL_DOCUMENTS,
  ["billing_amount", "Faturamento"],
]);

const FIELD_LABELS: Record<string, string> = {
  status: "Estado",
  type: "Tipo",
  link: "Link",
  notes: "Observação",
  justification: "Justificativa",
  triad_moviment: "Movimento enviado",
  responsible_id: "Responsável",
  billing_amount: "Faturamento",
  download_date: "Data de download",
  settlement_date: "Data de baixa",
  archived_at: "Arquivamento",
  priority: "Prioridade",
  delivery_method: "Meio de envio",
  active_items: "Itens configurados",
};

// Campos das notas de um item do checklist.
const NOTE_LABELS: Record<string, string> = {
  note: "observação",
  justification: "justificativa",
  priority: "prioridade",
  delivery_method: "meio de envio",
  required: "aplicável",
};

const OBJECT_LABELS: Record<string, string> = {
  "triagem.bank_statements": "Extrato bancário",
  "triagem.closings": "Fechamento recebido",
  "clientes.clouds": "Cloud do cliente",
};

const ROUTINE_LABELS: Record<string, string> = { CONTABIL: "Contábil", FISCAL: "Fiscal" };

/** Campo do evento: item do checklist, campo da nota de um item ou campo do registro. */
export function formatTriageHistoryField(field: string): string {
  const [root, item = "", noteField = ""] = field.split(".");
  if (root === "checklist") return ITEM_LABELS.get(item) ?? item;
  if (root === "item_notes") {
    return `${ITEM_LABELS.get(item) ?? item} · ${NOTE_LABELS[noteField] ?? noteField}`;
  }
  return FIELD_LABELS[field] ?? field;
}

export function formatTriageHistoryValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "(vazio)";
  if (value === true) return "Sim";
  if (value === false) return "Não";
  if (field === "status" || field.startsWith("checklist.")) {
    return STATUS_LABELS[value as TriageDocumentStatus] ?? String(value);
  }
  return String(value);
}

/** Objeto e ação do evento: cliente, competência, o que foi alterado e como. */
export function describeTriageHistoryEntry(entry: TriageDocumentHistoryEntry): string {
  const { kind, client_name, competence, routine_type } = entry.object;
  const routine = routine_type ? (ROUTINE_LABELS[routine_type] ?? routine_type) : null;
  const object =
    kind === "triagem.monthly"
      ? `Rotina ${routine ?? "documental"}`
      : kind === "triagem.configs"
        ? `Configuração ${routine ?? "da Triagem"}`
        : (OBJECT_LABELS[kind] ?? kind);
  return [client_name, competence, object, entry.action].filter(Boolean).join(" · ");
}
