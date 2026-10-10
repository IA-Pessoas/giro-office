export const CONTABIL_QUERY_KEY = ["contabil"] as const;

export function contabilControlQueryKey(clientId: string, competence: string) {
  return [...CONTABIL_QUERY_KEY, "control", clientId, competence] as const;
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

export function triageStatementsQueryKey(clientId: string, competence: string) {
  return [...CONTABIL_QUERY_KEY, "triage", "statements", clientId, competence] as const;
}

export function triageClosingQueryKey(clientId: string, competence: string) {
  return [...CONTABIL_QUERY_KEY, "triage", "closing", clientId, competence] as const;
}
