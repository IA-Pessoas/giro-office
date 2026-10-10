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

export function triageMonthlyQueryKey(
  clientId: string,
  competence: string,
  type = "CONTABIL",
) {
  return [...CONTABIL_QUERY_KEY, "triage", "monthly", clientId, competence, type] as const;
}

export function triageFiscalPortfolioQueryKey(competence: string) {
  return [...CONTABIL_QUERY_KEY, "triage", "fiscal-portfolio", competence] as const;
}

export function triageStatementsQueryKey(clientId: string, competence: string) {
  return [...CONTABIL_QUERY_KEY, "triage", "statements", clientId, competence] as const;
}

export function triageClosingQueryKey(clientId: string, competence: string) {
  return [...CONTABIL_QUERY_KEY, "triage", "closing", clientId, competence] as const;
}
