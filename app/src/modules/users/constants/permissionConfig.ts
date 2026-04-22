import type { KnownPermissionModuleKey } from "../types";

export const KNOWN_PERMISSION_MODULE_KEYS = [
  "atendimento",
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pec",
  "pessoal",
  "regularize",
  "rh",
  "triagem",
  "wiki",
] as const satisfies readonly KnownPermissionModuleKey[];

export const PERMISSION_MODULE_LABELS: Record<KnownPermissionModuleKey, string> = {
  atendimento: "Atendimento",
  certificado: "Certificado",
  comercial: "Comercial",
  contabil: "Contábil",
  financeiro: "Financeiro",
  fiscal: "Fiscal",
  integracao: "Integração",
  marketing: "Marketing",
  parcelamento: "Parcelamento",
  pec: "PEC",
  pessoal: "Pessoal",
  regularize: "Regularize",
  rh: "RH",
  triagem: "Triagem",
  wiki: "Wiki",
};

export const PERMISSION_MODULE_GROUPS = [
  {
    title: "Atendimento e Comercial",
    keys: ["atendimento", "certificado", "comercial", "marketing"],
  },
  {
    title: "Financeiro e Fiscal",
    keys: ["contabil", "financeiro", "fiscal", "parcelamento", "regularize"],
  },
  {
    title: "Pessoas e Operação",
    keys: ["pessoal", "rh", "triagem", "pec"],
  },
  {
    title: "Plataforma e Conhecimento",
    keys: ["integracao", "wiki"],
  },
] as const satisfies ReadonlyArray<{
  title: string;
  keys: readonly KnownPermissionModuleKey[];
}>;

export const PERMISSION_SELECT_OPTIONS = [
  { value: "null", label: "Sem acesso" },
  { value: "0", label: "Visualizador" },
  { value: "1", label: "Usuário" },
  { value: "2", label: "Administrador" },
] as const;

export function getPermissionModuleLabel(moduleKey: KnownPermissionModuleKey): string {
  return PERMISSION_MODULE_LABELS[moduleKey];
}
