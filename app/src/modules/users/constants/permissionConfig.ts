import type { KnownPermissionModuleKey } from "../types";

export const KNOWN_PERMISSION_MODULE_KEYS = [
  "atendimento",
  "certificado",
  "contabil",
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
    title: "Fiscal",
    keys: ["contabil", "fiscal", "regularize"],
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

export type PermissionLevel = 0 | 1 | 2;
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
  value: number | null | undefined,
): PermissionLevel | null {
  const normalizedValue: PermissionLevel | null =
    value === 0 || value === 1 || value === 2 ? value : null;
  const minimumLevel = getMinimumPermissionLevel(moduleKey);

  if (minimumLevel !== null && (normalizedValue === null || normalizedValue < minimumLevel)) {
    return minimumLevel;
  }

  return normalizedValue;
}

export function getPermissionSelectOptions(
  moduleKey: string,
): readonly PermissionSelectOption[] {
  const minimumLevel = getMinimumPermissionLevel(moduleKey);

  if (minimumLevel === null) {
    return PERMISSION_SELECT_OPTIONS;
  }

  return PERMISSION_SELECT_OPTIONS.filter(
    (option) => option.value !== "null" && Number(option.value) >= minimumLevel,
  );
}

export function getPermissionModuleLabel(moduleKey: KnownPermissionModuleKey): string {
  return PERMISSION_MODULE_LABELS[moduleKey];
}
