import type { AgendaModule } from "@shared/services/agendaService.contract";

export const CONTABIL_QUERY_KEY = ["contabil"] as const;

export function contabilControlQueryKey(clientId: string, competence: string) {
  return [...CONTABIL_QUERY_KEY, "control", clientId, competence] as const;
}

export function contabilControlHistoryQueryKey(clientId: string, competence: string, page?: number) {
  const key = [...CONTABIL_QUERY_KEY, "control-history", clientId, competence] as const;
  return page === undefined ? key : ([...key, page] as const);
}

export function contabilControlPortfolioQueryKey(competence: string) {
  return [...CONTABIL_QUERY_KEY, "controls", "list", competence] as const;
}

export function contabilResponsibleQueryKey(clientId: string) {
  return [...CONTABIL_QUERY_KEY, "responsible", clientId] as const;
}

export function contabilRelationshipQueryKey(clientId: string) {
  return [...CONTABIL_QUERY_KEY, "relationship", clientId] as const;
}

export function contabilRelationshipHistoryQueryKey(clientId: string, page?: number) {
  const key = [...CONTABIL_QUERY_KEY, "relationship-history", clientId] as const;
  return page === undefined ? key : ([...key, page] as const);
}

/** Sem `month`, é o prefixo de todos os meses (invalidação após escrita). */
export function departmentAgendaQueryKey(module: AgendaModule, month?: string) {
  const key = [...CONTABIL_QUERY_KEY, "agenda", module] as const;
  return month === undefined ? key : ([...key, month] as const);
}

export function triageMonthlyQueryKey(
  clientId: string,
  competence: string,
  type = "CONTABIL",
) {
  return [...CONTABIL_QUERY_KEY, "triage", "monthly", clientId, competence, type] as const;
}

export function triageMovementConfigQueryKey(clientId: string) {
  return [...CONTABIL_QUERY_KEY, "triage", "movement-config", clientId] as const;
}

export function triageFiscalSpecialConfigQueryKey(clientId: string) {
  return [...CONTABIL_QUERY_KEY, "triage", "fiscal-special-config", clientId] as const;
}

export function triageFiscalSettingsQueryKey(clientId: string) {
  return [...CONTABIL_QUERY_KEY, "triage", "fiscal-settings", clientId] as const;
}

/** Prefixo de todas as competências da carteira fiscal (invalidação por cliente). */
export const TRIAGE_FISCAL_PORTFOLIO_QUERY_KEY = [
  ...CONTABIL_QUERY_KEY,
  "triage",
  "fiscal-portfolio",
] as const;

export function triageFiscalPortfolioQueryKey(competence: string) {
  return [...TRIAGE_FISCAL_PORTFOLIO_QUERY_KEY, competence] as const;
}

/** Histórico bancário do cliente; sem `pendingOnly`, é o prefixo das duas variações. */
export function triageStatementHistoryQueryKey(clientId: string, pendingOnly?: boolean) {
  const base = [...CONTABIL_QUERY_KEY, "triage", "statement-history", clientId] as const;
  return pendingOnly === undefined ? base : ([...base, pendingOnly] as const);
}

export function triageStatementsQueryKey(clientId: string, competence: string) {
  return [...CONTABIL_QUERY_KEY, "triage", "statements", clientId, competence] as const;
}

export function triageClosingQueryKey(clientId: string, competence: string) {
  return [...CONTABIL_QUERY_KEY, "triage", "closing", clientId, competence] as const;
}
