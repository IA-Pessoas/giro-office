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

// Licença ativa = "Em Andamento" (legado: "Ativo"). Dashboard e filtro da aba usam a mesma
// lista para os números baterem (#1347).
export const ACTIVE_LICENSE_STATUSES = ["Em Andamento", "Ativo"] as const;

export const FINANCIAL_STATUS_VALUES = ["Pendente", "Regular", "Bônus", "Não Contratado"] as const;

export const FINANCIAL_STATUS_BY_LEGACY_CODE: Record<number, FinancialStatus> = {
  0: "Pendente",
  1: "Regular",
  3: "Bônus",
  4: "Não Contratado",
};

export type FinancialStatus = (typeof FINANCIAL_STATUS_VALUES)[number];

export type LicenseDateRange = { gte: Date; lt: Date };

export const processWriteStatusSchema = z.enum(CANONICAL_PROCESS_STATUSES);
const financialStatusCodeSchema = z
  .union([z.number().int(), z.string().regex(/^\d+$/).transform(Number)])
  .transform((code, context): FinancialStatus => {
    const status = FINANCIAL_STATUS_BY_LEGACY_CODE[code];
    if (!status) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Status financeiro inválido.",
      });
      return z.NEVER;
    }
    return status;
  });

export const processFinancialStatusSchema = z.union([
  z.enum(FINANCIAL_STATUS_VALUES),
  financialStatusCodeSchema,
]);
export const guidanceWriteStatusSchema = z.enum(CANONICAL_GUIDANCE_STATUSES);
export const licenseWriteStatusSchema = z.enum(CANONICAL_LICENSE_STATUSES);
export const licenseUpdateStatusSchema = z.enum([
  ...CANONICAL_LICENSE_STATUSES,
  ...LEGACY_LICENSE_STATUS_ALIASES,
] as [string, ...string[]]);

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

// A migração criou um processo técnico para cada orientação legada sem processo (a FK é
// obrigatória). Ele segura a orientação, mas não é trabalho do Regularize: fica fora das listas,
// do dashboard e dos relatórios e continua acessível pelo id (#1377). O texto vem da regra de
// migração em docs/migration/v4/scripts/rules/v2.mjs (guidance-process-derived).
export const LEGACY_GUIDANCE_PROCESS_TYPE = "Processo técnico para orientação legada";
export const OPERATIONAL_PROCESS_FILTER = {
  process_type: { not: LEGACY_GUIDANCE_PROCESS_TYPE },
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

export function buildLicenseStatusFilter(
  status: string,
  referenceDate = new Date(),
): Record<string, unknown> {
  if (status === "Todos") {
    return {};
  }

  const dueDateBounds = getLicenseDueDateBounds(referenceDate);
  if (status === "A vencer") {
    return {
      due_date: { gte: dueDateBounds.today, lt: addDays(dueDateBounds.nextMonth, 1) },
    };
  }

  if (status === "Vencido") {
    return { due_date: { lt: dueDateBounds.today } };
  }

  if ((ACTIVE_LICENSE_STATUSES as readonly string[]).includes(status)) {
    return { status: { in: [...ACTIVE_LICENSE_STATUSES] } };
  }

  return { status };
}

export function getLicenseDueDateBounds(referenceDate = new Date()): {
  today: Date;
  nextMonth: Date;
} {
  const today = startOfDay(referenceDate);
  return { today, nextMonth: addCalendarMonths(today, 1) };
}

export function getLicenseNotificationDateRange(referenceDate = new Date()): LicenseDateRange {
  const referenceDay = startOfDay(referenceDate);
  const targetDate = addCalendarMonths(referenceDay, 1);
  const targetMonthEnd = getLastDayOfMonth(targetDate);
  const endDate = isLastDayOfMonth(referenceDay)
    ? addDays(targetMonthEnd, 1)
    : addDays(targetDate, 1);

  return { gte: targetDate, lt: endDate };
}

function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addCalendarMonths(value: Date, months: number): Date {
  const result = new Date(value);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
}

function getLastDayOfMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function isLastDayOfMonth(value: Date): boolean {
  return value.getUTCDate() === getLastDayOfMonth(value).getUTCDate();
}
