import { TRIAGE_FISCAL_CONFIGURABLE_FIELDS } from "@workspace/shared/triagem/documents";

import type { TriageDocumentStatus } from "../types";

// Rótulos dos documentos da Triagem, sem dependências: o Fiscal também os lê, e importar
// o componente da Triagem de fora do módulo cria ciclo de inicialização no build.
export const CONTABIL_DOCUMENTS = [
  ["financial_transactions", "Movimentações financeiras"],
  ["triaged_transactions", "Movimentações triadas"],
  ["inventory_control", "Controle de estoque"],
  ["accounts_payable_report", "Relatório de contas a pagar"],
  ["accounts_receivable_report", "Relatório de contas a receber"],
  ["card_statements", "Faturas de cartão"],
  ["loan_agreements", "Contratos de empréstimo"],
  ["bank_reconciliation", "Conciliação bancária"],
  ["bank_investments", "Investimentos bancários"],
  ["card_sales_report", "Relatório de vendas de cartão"],
] as const;
export const FISCAL_DOCUMENTS = [
  ["inbound_report", "Relatório de entradas"],
  ["outbound_report", "Relatório de saídas"],
  ["nfse_provided", "NFSe prestados"],
  ["nfse_received", "NFSe recebidos"],
  ["cte_documents", "Documentos CTe"],
  ["mei_documents", "Documentos MEI"],
  ["nfce_documents", "Documentos NFCe"],
  ["sped_fiscal", "SPED Fiscal"],
  ["sped_contributions", "SPED Contribuições"],
  ["nfce_received", "NFCe recebidos"],
  ["model_21_invoice", "Nota fiscal modelo 21"],
  ["cte_as_issuer", "CTe como emitente"],
  ["services_provided_as_mei", "Serviços prestados como MEI"],
] as const;
/** Documentos especiais e faturamento configuráveis por cliente na rotina fiscal. */
export const FISCAL_CONFIGURABLE_DOCUMENTS = TRIAGE_FISCAL_CONFIGURABLE_FIELDS.map(
  (field) =>
    [
      field,
      field === "billing_amount"
        ? "Faturamento"
        : (FISCAL_DOCUMENTS.find(([document]) => document === field)?.[1] ?? field),
    ] as const,
);
export const STATUSES: Array<[TriageDocumentStatus, string]> = [
  ["PENDING", "Pendente"],
  ["COMPLETED", "Concluído"],
  ["ATTENTION", "Atenção"],
  ["UNDER_REVIEW", "Em revisão"],
  ["NOT_PRESENT", "Não possui"],
  ["NOT_APPLICABLE", "Não aplicável"],
];

export const STATUS_LABELS = Object.fromEntries(STATUSES) as Record<TriageDocumentStatus, string>;
