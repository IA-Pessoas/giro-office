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

/** Estados de item filtráveis na carteira Fiscal: os do checklist mais "a configurar". */
export const TRIAGE_PORTFOLIO_DOCUMENT_STATUSES = [
  ...TRIAGE_DOCUMENT_STATUSES,
  TRIAGE_PORTFOLIO_NOT_STARTED,
] as const;
export type TriagePortfolioDocumentStatus = (typeof TRIAGE_PORTFOLIO_DOCUMENT_STATUSES)[number];

export const TRIAGE_PORTFOLIO_JUSTIFICATION_FILTERS = ["with", "without"] as const;
/** Prioridade Sim/Não do cliente (não é urgência de solicitação nem prioridade de item). */
export const TRIAGE_PORTFOLIO_PRIORITY_FILTERS = ["yes", "no"] as const;
export type TriagePortfolioPriorityFilter = (typeof TRIAGE_PORTFOLIO_PRIORITY_FILTERS)[number];
/** Valor de `deliveryMethod` que seleciona clientes sem meio de envio. */
export const TRIAGE_PORTFOLIO_NO_DELIVERY_METHOD = "none";
export type TriagePortfolioJustificationFilter =
  (typeof TRIAGE_PORTFOLIO_JUSTIFICATION_FILTERS)[number];

/** Filtros da carteira Fiscal: os mesmos na tela, no CSV e em `GET /triagem/fiscal-portfolio`. */
export interface FiscalTriagePortfolioFilters {
  search?: string;
  responsibleId?: string;
  regime?: string;
  documentField?: TriageFiscalChecklistField;
  documentStatus?: TriagePortfolioDocumentStatus;
  justification?: TriagePortfolioJustificationFilter;
  priority?: TriagePortfolioPriorityFilter;
  deliveryMethod?: string;
}

/** Forma mínima de um item da carteira Fiscal que os filtros leem. */
export interface FiscalTriagePortfolioFilterable {
  legal_name: string;
  cpf_cnpj: string | null;
  regime: string | null;
  responsible_id: string | null;
  priority?: boolean;
  delivery_method?: string | null;
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

/** A empresa tem justificativa em algum item da rotina, qualquer que seja a coluna filtrada. */
function hasJustification(row: FiscalTriagePortfolioFilterable) {
  const notes = row.monthly?.item_notes ?? {};
  return TRIAGE_FISCAL_CHECKLIST_FIELDS.some((key) => Boolean(notes[key]?.justification?.trim()));
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
      (row.responsible_id || TRIAGE_PORTFOLIO_NO_RESPONSIBLE) !== filters.responsibleId
    )
      return false;
    if (filters.regime && (row.regime || TRIAGE_PORTFOLIO_NO_REGIME) !== filters.regime)
      return false;
    if (
      filters.documentField &&
      filters.documentStatus &&
      fiscalTriagePortfolioItemStatus(row, filters.documentField) !== filters.documentStatus
    )
      return false;
    if (filters.priority && (row.priority === true) !== (filters.priority === "yes")) return false;
    if (
      filters.deliveryMethod &&
      (row.delivery_method || TRIAGE_PORTFOLIO_NO_DELIVERY_METHOD) !== filters.deliveryMethod
    )
      return false;
    if (filters.justification) return hasJustification(row) === (filters.justification === "with");
    return true;
  });
}

/** Converte a query já validada (`document_field`, `responsible_id`…) nos filtros da tela. */
export function fiscalTriagePortfolioFiltersFromQuery(query: {
  search?: string;
  responsible_id?: string;
  regime?: string;
  document_field?: TriageFiscalChecklistField;
  document_status?: TriagePortfolioDocumentStatus;
  justification?: TriagePortfolioJustificationFilter;
  priority?: TriagePortfolioPriorityFilter;
  delivery_method?: string;
}): FiscalTriagePortfolioFilters {
  return {
    search: query.search,
    responsibleId: query.responsible_id,
    regime: query.regime,
    documentField: query.document_field,
    documentStatus: query.document_status,
    justification: query.justification,
    priority: query.priority,
    deliveryMethod: query.delivery_method,
  };
}

/** Forma mínima de um item da carteira Contábil que os filtros leem. */
export interface ContabilTriagePortfolioFilterable {
  regime: string | null;
  person_responsible_id: string | null;
  closing: { status: string } | null;
}

/** Filtros da carteira Contábil, com os mesmos sentinelas da Fiscal. */
export interface ContabilTriagePortfolioFilters {
  responsibleId?: string;
  regime?: string;
  closingStatus?: string;
}

export function filterContabilTriagePortfolio<T extends ContabilTriagePortfolioFilterable>(
  rows: readonly T[],
  filters: ContabilTriagePortfolioFilters,
): T[] {
  return rows.filter(
    (row) =>
      (!filters.responsibleId ||
        (row.person_responsible_id || TRIAGE_PORTFOLIO_NO_RESPONSIBLE) === filters.responsibleId) &&
      (!filters.regime || (row.regime || TRIAGE_PORTFOLIO_NO_REGIME) === filters.regime) &&
      (!filters.closingStatus || row.closing?.status === filters.closingStatus),
  );
}
