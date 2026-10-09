import {
  TRIAGE_DOCUMENT_STATUSES,
  TRIAGE_FISCAL_CHECKLIST_FIELDS,
  type TriageFiscalChecklistField,
} from "./triageDocuments.js";

/** Item sem checklist planejado nem mensal: a competência ainda não foi configurada. */
export const TRIAGE_PORTFOLIO_NOT_STARTED = "NOT_STARTED";
/** Valor de `responsibleId` que seleciona a carteira sem responsável. */
export const TRIAGE_PORTFOLIO_NO_RESPONSIBLE = "none";
/** Valor de `regime` que seleciona clientes sem regime cadastrado. */
export const TRIAGE_PORTFOLIO_NO_REGIME = "Não informado";

export type TriagePortfolioJustificationFilter = "with" | "without";

/** Filtros da carteira Fiscal: os mesmos na tela, no CSV e em `GET /triagem/fiscal-portfolio`. */
export interface FiscalTriagePortfolioFilters {
  search?: string;
  responsibleId?: string;
  regime?: string;
  documentField?: TriageFiscalChecklistField;
  documentStatus?: string;
  justification?: TriagePortfolioJustificationFilter;
}

/** Forma mínima de um item da carteira que os filtros leem. */
export interface FiscalTriagePortfolioFilterable {
  legal_name: string;
  cpf_cnpj: string | null;
  regime: string | null;
  responsible_id: string | null;
  planned_checklist: Record<string, string> | null;
  monthly: {
    checklist: Record<string, string>;
    item_notes: Record<string, { justification?: string | null } | undefined>;
  } | null;
}

/** Status exibido de um item: o mensal, senão o planejado, senão "a configurar". */
export function fiscalTriagePortfolioItemStatus(
  row: FiscalTriagePortfolioFilterable,
  field: TriageFiscalChecklistField,
): string {
  return (
    row.monthly?.checklist[field] ?? row.planned_checklist?.[field] ?? TRIAGE_PORTFOLIO_NOT_STARTED
  );
}

function hasJustification(
  row: FiscalTriagePortfolioFilterable,
  field?: TriageFiscalChecklistField,
) {
  const notes = row.monthly?.item_notes ?? {};
  const fields = field ? [field] : TRIAGE_FISCAL_CHECKLIST_FIELDS;
  return fields.some((key) => Boolean(notes[key]?.justification?.trim()));
}

export function filterFiscalTriagePortfolio<T extends FiscalTriagePortfolioFilterable>(
  rows: readonly T[],
  filters: FiscalTriagePortfolioFilters,
): T[] {
  const query = filters.search?.trim().toLocaleLowerCase("pt-BR") ?? "";
  return rows.filter((row) => {
    if (
      query &&
      !`${row.legal_name} ${row.cpf_cnpj ?? ""}`.toLocaleLowerCase("pt-BR").includes(query)
    )
      return false;
    if (
      filters.responsibleId &&
      (row.responsible_id ?? TRIAGE_PORTFOLIO_NO_RESPONSIBLE) !== filters.responsibleId
    )
      return false;
    if (filters.regime && (row.regime ?? TRIAGE_PORTFOLIO_NO_REGIME) !== filters.regime)
      return false;
    if (
      filters.documentField &&
      filters.documentStatus &&
      fiscalTriagePortfolioItemStatus(row, filters.documentField) !== filters.documentStatus
    )
      return false;
    if (filters.justification) {
      return hasJustification(row, filters.documentField) === (filters.justification === "with");
    }
    return true;
  });
}

const DOCUMENT_STATUSES: readonly string[] = [
  ...TRIAGE_DOCUMENT_STATUSES,
  TRIAGE_PORTFOLIO_NOT_STARTED,
];

/** Lê os filtros da query string (`document_field`, `responsible_id`…); lança em valor inválido. */
export function parseFiscalTriagePortfolioFilters(
  query: Record<string, string | undefined>,
): FiscalTriagePortfolioFilters {
  const text = (key: string) => query[key]?.trim() || undefined;
  const filters: FiscalTriagePortfolioFilters = {};
  const search = text("search");
  const responsibleId = text("responsible_id");
  const regime = text("regime");
  const documentField = text("document_field");
  const documentStatus = text("document_status");
  const justification = text("justification");
  if (search) filters.search = search;
  if (responsibleId) filters.responsibleId = responsibleId;
  if (regime) filters.regime = regime;
  if (documentField) {
    if (!(TRIAGE_FISCAL_CHECKLIST_FIELDS as readonly string[]).includes(documentField))
      throw new RangeError("document_field inválido.");
    filters.documentField = documentField as TriageFiscalChecklistField;
  }
  if (documentStatus) {
    if (!DOCUMENT_STATUSES.includes(documentStatus))
      throw new RangeError("document_status inválido.");
    filters.documentStatus = documentStatus;
  }
  if (justification) {
    if (justification !== "with" && justification !== "without")
      throw new RangeError("justification deve ser with ou without.");
    filters.justification = justification;
  }
  return filters;
}
