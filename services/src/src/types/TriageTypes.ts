export const CONTABIL_FIELDS = [
    "financial_transactions", "triaged_transactions", "inventory_control",
    "accounts_payable_report", "accounts_receivable_report", "card_statements",
    "loan_agreements", "bank_reconciliation", "bank_investments", "card_sales_report"
];

export const FISCAL_FIELDS = [
    "inbound_report", "outbound_report", "nfse_provided", "nfse_received",
    "cte_documents", "mei_documents", "nfce_documents", "sped_fiscal",
    "sped_contributions", "nfce_received", "model_21_invoice",
    "cte_as_issuer", "services_provided_as_mei"
];

// Status permitidos para os botões
export type TriageStatus = "" | "nao possui" | "atenção" | "concluido";