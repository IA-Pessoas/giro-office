import { fiscalTriagePortfolioItemStatus } from "@workspace/shared/triagem/portfolioFilters";

import { formatCount } from "../../../shared/utils/formatters.ts";
import type { FiscalTriagePortfolioItem, TriageDocumentStatus } from "../types";
import { FISCAL_DOCUMENTS, STATUS_LABELS } from "./triageDocumentLabels.ts";

type DeliveryLabel = (code: string | null) => string;

export function fiscalTriageStatusLabel(status: string) {
  return status === "NOT_STARTED"
    ? "A configurar"
    : (STATUS_LABELS[status as TriageDocumentStatus] ?? status);
}

function csvCell(value: string) {
  const safe = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/**
 * Grade da carteira fiscal para CSV e impressão: recebe as linhas já filtradas pela tela, então
 * os arquivos trazem os mesmos clientes, e o total é o delas.
 */
export function fiscalTriagePortfolioExportTable(
  rows: readonly FiscalTriagePortfolioItem[],
  deliveryLabel: DeliveryLabel,
) {
  return {
    columns: [
      "Empresa",
      "CNPJ",
      "Regime",
      "Responsável",
      "Prioridade",
      "Meio de envio",
      ...FISCAL_DOCUMENTS.map(([, label]) => label),
    ],
    body: rows.map((row) => [
      row.legal_name,
      row.cpf_cnpj,
      row.regime ?? "",
      row.responsible_name ?? "",
      row.priority ? "Sim" : "Não",
      deliveryLabel(row.delivery_method),
      ...FISCAL_DOCUMENTS.map(([field]) =>
        fiscalTriageStatusLabel(fiscalTriagePortfolioItemStatus(row, field)),
      ),
    ]),
    total: formatCount(rows.length, "empresa", "empresas"),
  };
}

/** CSV da grade, com o total na última linha. */
export function fiscalTriagePortfolioCsv(
  rows: readonly FiscalTriagePortfolioItem[],
  deliveryLabel: DeliveryLabel,
): string {
  const { columns, body, total } = fiscalTriagePortfolioExportTable(rows, deliveryLabel);
  return [columns, ...body, ["Total", total]]
    .map((line) => line.map(csvCell).join(","))
    .join("\r\n");
}
