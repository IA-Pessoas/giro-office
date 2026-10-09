/**
 * Catálogo de obrigações mensais do controle fiscal.
 *
 * Só entra aqui obrigação com periodicidade e aplicabilidade conferidas em fonte oficial
 * vigente (`source`, conferida em `checkedOn`). Obrigação `conditional` nunca é sugerida
 * pelo regime: depende de fato que o regime não revela (ex.: DIRBI só com benefício fiscal)
 * e entra no controle por inclusão manual com motivo. Dispensa pontual de uma sugerida
 * (ex.: mês sem receita) é registrada como "não aplicável" com motivo.
 *
 * Mudar o catálogo não reescreve competências passadas: a sugestão usa o regime registrado
 * no controle ao nascer, e itens já gravados não são apagados.
 */
export const FISCAL_OBLIGATION_CODES = [
  "PGDAS_D",
  "DCTFWEB",
  "EFD_CONTRIBUICOES",
  "DIRBI",
] as const;

export type FiscalObligationCode = (typeof FISCAL_OBLIGATION_CODES)[number];

export interface FiscalObligationDefinition {
  code: FiscalObligationCode;
  name: string;
  periodicity: "MONTHLY";
  /** Regimes (rótulo normalizado) em que a obrigação é sugerida. Vazio em condicionais. */
  regimes: readonly string[];
  conditional: boolean;
  source: string;
  checkedOn: string;
  note: string;
}

const SIMPLES = "simples nacional";
const PRESUMIDO = "lucro presumido";
const REAL = "lucro real";

export const FISCAL_OBLIGATION_CATALOG: readonly FiscalObligationDefinition[] = [
  {
    code: "PGDAS_D",
    name: "PGDAS-D",
    periodicity: "MONTHLY",
    regimes: [SIMPLES],
    conditional: false,
    source: "https://www.gov.br/pt-br/servicos/declarar-apuracoes-mensais-do-simples-nacional",
    checkedOn: "2026-10-09",
    note: "Mensal, até o dia 20 do mês seguinte, ainda que sem receita no período.",
  },
  {
    code: "DCTFWEB",
    name: "DCTFWeb",
    periodicity: "MONTHLY",
    regimes: [PRESUMIDO, REAL],
    conditional: false,
    source: "https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=141910",
    checkedOn: "2026-10-09",
    note: "IN RFB 2.237/2024: substitui a DCTF desde 01/2025; entrega até o último dia útil do mês seguinte (IN RFB 2.248/2025).",
  },
  {
    code: "EFD_CONTRIBUICOES",
    name: "EFD-Contribuições",
    periodicity: "MONTHLY",
    regimes: [PRESUMIDO, REAL],
    conditional: false,
    source:
      "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/sped/efd-contribuicoes/efdc",
    checkedOn: "2026-10-09",
    note: "IN RFB 1.252/2012: mensal, até o 10º dia útil do 2º mês seguinte; mês dispensado vira não aplicável com motivo.",
  },
  {
    code: "DIRBI",
    name: "DIRBI",
    periodicity: "MONTHLY",
    regimes: [],
    conditional: true,
    source:
      "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/beneficios-fiscais/beneficios-fiscais/declaracao-de-incentivos-renuncias-beneficios-e-imunidades-de-natureza-tributaria-dirbi/tenho-que-declarar-todos-os",
    checkedOn: "2026-10-09",
    note: "Mensal e condicional ao benefício fiscal; nunca inferida do regime.",
  },
];

export function normalizeRegime(regime: string | null | undefined): string {
  return (regime ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function findObligation(code: string): FiscalObligationDefinition | undefined {
  return FISCAL_OBLIGATION_CATALOG.find((item) => item.code === code);
}

/** Obrigações sugeridas para o regime registrado no controle. */
export function suggestedObligations(regime: string | null): FiscalObligationDefinition[] {
  const normalized = normalizeRegime(regime);
  return FISCAL_OBLIGATION_CATALOG.filter(
    (item) => !item.conditional && item.regimes.includes(normalized),
  );
}
