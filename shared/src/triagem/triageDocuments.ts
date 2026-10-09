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
