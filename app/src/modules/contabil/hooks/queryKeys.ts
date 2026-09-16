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
