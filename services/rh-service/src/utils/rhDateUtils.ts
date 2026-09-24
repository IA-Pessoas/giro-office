import { ServiceError } from "@workspace/shared";

export const DEFAULT_ORGANIZATION_TIMEZONE = "UTC";

interface PointTimes {
  clock_in: Date;
  lunch_out: Date;
  lunch_in: Date;
  clock_out: Date;
}

export type OrganizationDateInput = Date | string;

function datePartsInTimezone(date: Date, timezone: string): Record<string, string> {
  try {
    return Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
  } catch (err: unknown) {
    throw new ServiceError(500, "Fuso horario da organizacao invalido.", err);
  }
}

function dateTimePartsInTimezone(date: Date, timezone: string): Record<string, string> {
  try {
    return Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
  } catch (err: unknown) {
    throw new ServiceError(500, "Fuso horario da organizacao invalido.", err);
  }
}

function organizationDateKeyToUtcStart(dateKey: string, timezone: string): Date {
  const target = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(target.getTime())) {
    throw new ServiceError(400, "Data invalida.");
  }

  let guess = target;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const parts = dateTimePartsInTimezone(guess, timezone);
    const renderedLocalAsUtc = new Date(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`,
    );
    const nextGuess = new Date(guess.getTime() + target.getTime() - renderedLocalAsUtc.getTime());
    if (nextGuess.getTime() === guess.getTime()) return guess;
    guess = nextGuess;
  }

  return guess;
}

export function organizationDateKey(date: Date, timezone = DEFAULT_ORGANIZATION_TIMEZONE): string {
  if (Number.isNaN(date.getTime())) {
    throw new ServiceError(400, "Data invalida.");
  }

  const parts = datePartsInTimezone(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function organizationDateKeyFromInput(
  input: OrganizationDateInput,
  timezone = DEFAULT_ORGANIZATION_TIMEZONE,
): string {
  if (typeof input === "string") {
    const value = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) {
        return value;
      }
      throw new ServiceError(400, "Data invalida.");
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new ServiceError(400, "Data invalida.");
    }
    return organizationDateKey(parsed, timezone);
  }

  return organizationDateKey(input, timezone);
}

export function normalizeOrganizationDate(
  date: OrganizationDateInput,
  timezone = DEFAULT_ORGANIZATION_TIMEZONE,
): Date {
  const key = organizationDateKeyFromInput(date, timezone);
  return organizationDateKeyToUtcStart(key, timezone);
}

export function organizationDayBounds(
  date: Date,
  timezone = DEFAULT_ORGANIZATION_TIMEZONE,
): { start: Date; end: Date } {
  const key = organizationDateKey(date, timezone);
  const start = organizationDateKeyToUtcStart(key, timezone);
  const nextDate = new Date(`${key}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextKey = nextDate.toISOString().slice(0, 10);
  const nextStart = organizationDateKeyToUtcStart(nextKey, timezone);
  return { start, end: new Date(nextStart.getTime() - 1) };
}

// Feriado é data civil sem fuso: o holidayService grava à meia-noite UTC. Para achar o feriado de
// um instante, use o dia civil da organização e procure esse dia em UTC, não os limites locais.
export function holidayDayBounds(
  date: Date,
  timezone = DEFAULT_ORGANIZATION_TIMEZONE,
): { start: Date; end: Date } {
  const key = organizationDateKey(date, timezone);
  return { start: new Date(`${key}T00:00:00.000Z`), end: new Date(`${key}T23:59:59.999Z`) };
}

export function holidayDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function assertSameOrganizationDay(
  times: PointTimes,
  timezone = DEFAULT_ORGANIZATION_TIMEZONE,
): void {
  const expected = organizationDateKey(times.clock_in, timezone);
  const fields: Array<keyof PointTimes> = ["lunch_out", "lunch_in", "clock_out"];
  for (const field of fields) {
    if (organizationDateKey(times[field], timezone) !== expected) {
      throw new ServiceError(400, "Jornadas noturnas nao sao permitidas para ajustes de ponto.");
    }
  }
}

export function assertChronologicalPointTimes(times: PointTimes): void {
  if (
    times.clock_in.getTime() >= times.lunch_out.getTime() ||
    times.lunch_out.getTime() >= times.lunch_in.getTime() ||
    times.lunch_in.getTime() >= times.clock_out.getTime()
  ) {
    throw new ServiceError(400, "Os horarios do ajuste devem estar em ordem cronologica.");
  }
}
