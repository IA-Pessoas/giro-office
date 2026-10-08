/**
 * Regimes tributários aceitos em Clientes, Regularize e Fiscal (fonte única).
 * MEI é enquadramento do Simples; e-Social, CNO e CAEPF são cadastros, não regimes.
 * Fica neste arquivo porque o app lê shared/src via condição "development" e o Next não
 * resolve import relativo ".js" entre arquivos .ts daqui.
 */
export const TAX_REGIME_OPTIONS = ["Simples Nacional", "Lucro Presumido", "Lucro Real"] as const;

export type TaxRegime = (typeof TAX_REGIME_OPTIONS)[number];

// Código gravado em Fiscal/NCM, herdado de tb_fiscal.tributacao_pis_cofins.regime.
// Explícito por regime: reordenar a lista não muda o significado.
export const FISCAL_TAX_REGIME_CODES = {
  "Simples Nacional": "0",
  "Lucro Presumido": "1",
  "Lucro Real": "2",
} as const satisfies Record<TaxRegime, string>;

export const REGULARIZE_GUIDANCE_TARGET_TYPES = ["PJ", "PF", "SEM_CLIENTE"] as const;

export const REGULARIZE_GUIDANCE_CHECKLIST_ITEMS = [
  { code: "type", label: "Tipo de orientação" },
  { code: "request", label: "Solicitação" },
  { code: "framework_obs", label: "Observações de enquadramento" },
  { code: "legal_nature", label: "Natureza jurídica" },
  { code: "company_name", label: "Razão social" },
  { code: "trade_name", label: "Nome fantasia" },
  { code: "cpf_cnpj", label: "CPF/CNPJ" },
  { code: "share_capital", label: "Capital social" },
  { code: "iptu", label: "IPTU" },
  { code: "address", label: "Endereço" },
  { code: "comporate_purpose", label: "Objeto social" },
  { code: "carryng", label: "Porte" },
  { code: "regime", label: "Regime tributário" },
  { code: "legal_representative", label: "Representante legal" },
  { code: "economic_activities", label: "Atividades econômicas" },
  { code: "partners", label: "Sócios" },
  { code: "branch", label: "Filial" },
] as const;

export type RegularizeGuidanceChecklistCode =
  (typeof REGULARIZE_GUIDANCE_CHECKLIST_ITEMS)[number]["code"];

export const REGULARIZE_GUIDANCE_CHECKLIST_CODES = REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.map(
  ({ code }) => code,
) as [RegularizeGuidanceChecklistCode, ...RegularizeGuidanceChecklistCode[]];

export const REGULARIZE_GUIDANCE_CHECKLIST_STATUSES = [
  "Pendente",
  "Concluído",
  "Não se aplica",
] as const;

export type RegularizeGuidanceTargetType = (typeof REGULARIZE_GUIDANCE_TARGET_TYPES)[number];
export type RegularizeGuidanceChecklistStatus =
  (typeof REGULARIZE_GUIDANCE_CHECKLIST_STATUSES)[number];

export type RegularizeGuidanceSnapshot = {
  version: 1;
  source: "client_pj" | "client_pf" | "manual";
  name?: string;
  document?: string;
  address?: string;
  city?: string;
  state?: string;
  company_name?: string;
  trade_name?: string;
  cpf_cnpj?: string;
  legal_nature?: string;
  share_capital?: number | string;
  regime?: string;
  [key: string]: unknown;
};

export type RegularizeGuidanceBranchData = {
  name: string;
  document?: string;
  address: string;
  city: string;
  state: string;
};
