/** Status de um documento no checklist da Triagem. */
export const TRIAGE_DOCUMENT_STATUSES = [
  "PENDING",
  "COMPLETED",
  "ATTENTION",
  "UNDER_REVIEW",
  "NOT_PRESENT",
  "NOT_APPLICABLE",
] as const;

export type TriageDocumentStatus = (typeof TRIAGE_DOCUMENT_STATUSES)[number];

/**
 * Status que ainda pendem: PENDING aguarda o documento; ATTENTION e UNDER_REVIEW aguardam
 * conferência. NOT_PRESENT e NOT_APPLICABLE não pendem.
 */
export const TRIAGE_PENDING_DOCUMENT_STATUSES = [
  "PENDING",
  "ATTENTION",
  "UNDER_REVIEW",
] as const satisfies readonly TriageDocumentStatus[];

/** Itens do checklist da rotina fiscal da Triagem. */
export const TRIAGE_FISCAL_CHECKLIST_FIELDS = [
  "inbound_report",
  "outbound_report",
  "nfse_provided",
  "nfse_received",
  "cte_documents",
  "mei_documents",
  "nfce_documents",
  "sped_fiscal",
  "sped_contributions",
  "nfce_received",
  "model_21_invoice",
  "cte_as_issuer",
  "services_provided_as_mei",
] as const;

export type TriageFiscalChecklistField = (typeof TRIAGE_FISCAL_CHECKLIST_FIELDS)[number];

/**
 * Documentos fiscais especiais: só entram na rotina do cliente que os tem configurados
 * (legado `tb_triagem.campos`: nfce, sped, spedContribuicoes, nfce_tomados, modelo_21,
 * cte_emitente, prestadas_mei). Faturamento é valor (`billing_amount`), não item.
 */
export const TRIAGE_FISCAL_SPECIAL_FIELDS = [
  "nfce_documents",
  "sped_fiscal",
  "sped_contributions",
  "nfse_received",
  "model_21_invoice",
  "cte_as_issuer",
  "services_provided_as_mei",
] as const satisfies readonly TriageFiscalChecklistField[];

export type TriageFiscalSpecialField = (typeof TRIAGE_FISCAL_SPECIAL_FIELDS)[number];

/**
 * Estados gravados pelo legado (`TriageStatus`, igual nas rotinas Contábil e Fiscal):
 * vazio é pendente. Mapeamento explícito para os estados atuais.
 */
export const TRIAGE_LEGACY_DOCUMENT_STATUSES: ReadonlyMap<string, TriageDocumentStatus> = new Map<
  string,
  TriageDocumentStatus
>([
  ["", "PENDING"],
  ["nao possui", "NOT_PRESENT"],
  ["atenção", "ATTENTION"],
  ["atencao", "ATTENTION"],
  ["concluido", "COMPLETED"],
]);

/** Estado atual de um item (também os do legado); `null` para valor desconhecido. */
export function normalizeTriageDocumentStatus(value: unknown): TriageDocumentStatus | null {
  if (typeof value !== "string") return null;
  if ((TRIAGE_DOCUMENT_STATUSES as readonly string[]).includes(value))
    return value as TriageDocumentStatus;
  return TRIAGE_LEGACY_DOCUMENT_STATUSES.get(value) ?? null;
}
