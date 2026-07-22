import type { KnownPermissionModuleKey } from "../types";

export const KNOWN_PERMISSION_MODULE_KEYS = [
  "atendimento",
  "certificado",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "pec",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "wiki",
] as const satisfies readonly KnownPermissionModuleKey[];

export const PERMISSION_MODULE_LABELS: Record<KnownPermissionModuleKey, string> = {
  atendimento: "Atendimento",
  certificado: "Certificado",
  contabil: "Contábil",
  financeiro: "Financeiro",
  fiscal: "Fiscal",
  integracao: "Integração",
  pec: "PEC",
  pessoal: "Pessoal",
  regularize: "Regularize",
  rh: "RH",
  ti: "Tecnologia",
  wiki: "Wiki",
};

export const PERMISSION_MODULE_GROUPS = [
  {
    title: "Financeiro e Fiscal",
    keys: ["contabil", "financeiro", "fiscal", "regularize"],
  },
  {
    title: "Atendimento e Comercial",
    keys: ["atendimento", "certificado"],
  },
  {
    title: "Pessoas e Operação",
    keys: ["pessoal", "rh", "pec"],
  },
  {
    title: "Plataforma e Conhecimento",
    keys: ["integracao", "ti", "wiki"],
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
