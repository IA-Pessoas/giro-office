import { z } from "zod";

export const CANONICAL_PROCESS_STATUSES = [
  "Pendente",
  "Andamento",
  "Protocolado",
  "Finalizado",
  "Paralisado",
] as const;

export const LEGACY_PROCESS_STATUS_ALIASES = [
  "Aberto",
  "Em andamento",
  "Concluído",
  "Concluido",
  "Paralizado",
] as const;

export const CANONICAL_GUIDANCE_STATUSES = ["Em andamento", "Finalizado"] as const;

export const CANONICAL_LICENSE_STATUSES = [
  "Em Processo de Solicitação",
  "Em Andamento",
  "Finalizado",
  "Paralisado",
] as const;

export const LEGACY_LICENSE_STATUS_ALIASES = ["Ativo", "Pendente", "Inativo", "Cancelado"] as const;

export const processWriteStatusSchema = z.enum(CANONICAL_PROCESS_STATUSES);
export const guidanceWriteStatusSchema = z.enum(CANONICAL_GUIDANCE_STATUSES);
export const licenseWriteStatusSchema = z.enum(CANONICAL_LICENSE_STATUSES);

export const processReadStatusSchema = z.enum([
  "Todos",
  ...CANONICAL_PROCESS_STATUSES,
  ...LEGACY_PROCESS_STATUS_ALIASES,
] as [string, ...string[]]);

export const licenseReadStatusSchema = z.enum([
  "Todos",
  ...CANONICAL_LICENSE_STATUSES,
  ...LEGACY_LICENSE_STATUS_ALIASES,
  "A vencer",
  "Vencido",
] as [string, ...string[]]);

const PROCESS_STATUS_EQUIVALENTS = {
  Pendente: ["Pendente"],
  Andamento: ["Andamento", "Aberto", "Em andamento"],
  Protocolado: ["Protocolado"],
  Finalizado: ["Finalizado", "Concluído", "Concluido"],
  Paralisado: ["Paralisado", "Paralizado"],
} as const;

export function buildProcessStatusFilter(status: string): Record<string, unknown> {
  if (status === "Todos") {
    return {};
  }

  const equivalents = Object.values(PROCESS_STATUS_EQUIVALENTS).find((values) =>
    values.some((value) => value === status),
  );

  if (equivalents && equivalents.length > 1) {
    return { status: { in: [...equivalents] } };
  }

  return { status };
}

export function buildLicenseStatusFilter(status: string): Record<string, unknown> {
  return status === "Todos" ? {} : { status };
}
