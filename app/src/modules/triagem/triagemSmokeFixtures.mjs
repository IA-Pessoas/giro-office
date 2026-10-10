// Resposta vazia dos indicadores de solicitações (#1698) para os smokes da página /triagem,
// cujo fallback genérico devolve [] e quebraria o painel que espera um objeto.
export const EMPTY_SOLICITATION_INDICATORS = {
  competence: "2026-09",
  notes_by_responsible: [],
  solicitations_by_requester: [],
  totals: { solicitations: 0, clients: 0, notes: 0 },
};
