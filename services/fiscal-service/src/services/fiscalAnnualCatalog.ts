import { FISCAL_REGIMES, type FiscalObligationDefinition } from "./fiscalObligationCatalog.js";

/**
 * Declarações anuais do controle fiscal (por cliente e ano-calendário), conferidas em fonte
 * oficial em `checkedOn`. Só a DEFIS é sugerida pelo regime; as demais dependem de fato que
 * o regime não revela e entram por inclusão manual com motivo. Não há DIRBI anual: a
 * DIRBI vigente é mensal e condicional (controle mensal).
 */
export const FISCAL_ANNUAL_DECLARATION_CODES = ["DEFIS", "DMED", "DIMOB", "DASN_SIMEI"] as const;

export type FiscalAnnualDeclarationCode = (typeof FISCAL_ANNUAL_DECLARATION_CODES)[number];

export const FISCAL_ANNUAL_CATALOG: readonly FiscalObligationDefinition<FiscalAnnualDeclarationCode>[] =
  [
    {
      code: "DEFIS",
      name: "DEFIS",
      regimes: [FISCAL_REGIMES.simples],
      conditional: false,
      excludedRegimes: [FISCAL_REGIMES.presumido, FISCAL_REGIMES.real],
      source:
        "https://www.gov.br/pt-br/servicos/declarar-apuracoes-e-informacoes-anuais-do-simples-nacional",
      checkedOn: "2026-10-09",
      note: "ME/EPP optante pelo Simples em algum período do ano; até 31/03 do ano seguinte, mesmo sem receita. MEI entrega a DASN-SIMEI: marque não aplicável com motivo.",
    },
    {
      code: "DMED",
      name: "DMED",
      regimes: [],
      conditional: true,
      excludedRegimes: [],
      source: "https://www.gov.br/pt-br/servicos/declarar-servicos-medicos-e-da-saude",
      checkedOn: "2026-10-09",
      note: "Prestadora de serviços de saúde ou operadora de plano (IN RFB 2.074/2022); até o último dia útil de fevereiro do ano seguinte.",
    },
    {
      code: "DIMOB",
      name: "DIMOB",
      regimes: [],
      conditional: true,
      excludedRegimes: [],
      source: "https://www.gov.br/pt-br/servicos/declarar-atividades-imobiliarias",
      checkedOn: "2026-10-09",
      note: "Construção, incorporação, intermediação ou administração de imóveis com operações no ano (IN RFB 1.115/2010); até o último dia útil de fevereiro do ano seguinte.",
    },
    {
      code: "DASN_SIMEI",
      name: "DASN-SIMEI",
      regimes: [],
      conditional: true,
      excludedRegimes: [FISCAL_REGIMES.presumido, FISCAL_REGIMES.real],
      source:
        "https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/servicos-para-mei/declaracao-anual-de-faturamento/o-que-e-a-dasn-simei",
      checkedOn: "2026-10-09",
      note: "MEI optante pelo SIMEI em algum período do ano, mesmo sem faturamento; até 31/05 do ano seguinte.",
    },
  ];

export function findAnnualDeclaration(
  code: string,
): FiscalObligationDefinition<FiscalAnnualDeclarationCode> | undefined {
  return FISCAL_ANNUAL_CATALOG.find((item) => item.code === code);
}
