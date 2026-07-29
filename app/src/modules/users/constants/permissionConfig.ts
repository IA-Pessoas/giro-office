import type { KnownPermissionModuleKey } from "../types";

export const KNOWN_PERMISSION_MODULE_KEYS = [
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
] as const satisfies readonly KnownPermissionModuleKey[];

export const RETIRED_PERMISSION_MODULE_KEYS = ["atendimento", "pec", "wiki"] as const;

export const PERMISSION_MODULE_LABELS: Record<KnownPermissionModuleKey, string> = {
  certificado: "Certificado",
  comercial: "Comercial",
  contabil: "Contábil",
  financeiro: "Financeiro",
  fiscal: "Fiscal",
  integracao: "Integração",
  marketing: "Marketing",
  parcelamento: "Parcelamento",
  pessoal: "Pessoal",
  regularize: "Regularize",
  rh: "RH",
  ti: "Tecnologia",
  triagem: "Triagem",
};

export const PERMISSION_MODULE_GROUPS = [
  {
    title: "Fiscal",
    keys: ["contabil", "financeiro", "fiscal", "regularize", "parcelamento"],
  },
  {
    title: "Certificados",
    keys: ["certificado"],
  },
  {
    title: "Pessoas e Operação",
    keys: ["pessoal", "rh"],
  },
  {
    title: "Plataforma e Conhecimento",
    keys: ["integracao", "ti", "comercial", "marketing", "triagem"],
  },
] as const satisfies ReadonlyArray<{
  title: string;
  keys: readonly KnownPermissionModuleKey[];
}>;

export const PERMISSION_SELECT_OPTIONS = [
  { value: "0", label: "Sem acesso" },
  { value: "1", label: "Visualizador" },
  { value: "2", label: "Usuário" },
  { value: "3", label: "Administrador" },
] as const;

export type PermissionLevel = 0 | 1 | 2 | 3;
export type PermissionSelectOption = (typeof PERMISSION_SELECT_OPTIONS)[number];

export const MINIMUM_PERMISSION_LEVEL_BY_MODULE: Partial<
  Record<KnownPermissionModuleKey, PermissionLevel>
> = {
  rh: 0,
  ti: 0,
};

export function getMinimumPermissionLevel(moduleKey: string): PermissionLevel | null {
  return MINIMUM_PERMISSION_LEVEL_BY_MODULE[moduleKey as KnownPermissionModuleKey] ?? null;
}

export function normalizePermissionForModule(
  moduleKey: string,
  value: number | undefined,
): PermissionLevel {
  const normalizedValue: PermissionLevel =
    value === 0 || value === 1 || value === 2 || value === 3 ? value : 0;
  const minimumLevel = getMinimumPermissionLevel(moduleKey);

  if (minimumLevel !== null && normalizedValue < minimumLevel) {
    return minimumLevel;
  }

  return normalizedValue;
}

export function getPermissionSelectOptions(
  _moduleKey: string,
): readonly PermissionSelectOption[] {
  return PERMISSION_SELECT_OPTIONS;
}

export function getPermissionModuleLabel(moduleKey: KnownPermissionModuleKey): string {
  return PERMISSION_MODULE_LABELS[moduleKey];
}
