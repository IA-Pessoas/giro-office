import {
  DEFAULT_ORGANIZATION_TIMEZONE,
  normalizeOrganizationDate,
  organizationDateKey,
  organizationDayBounds,
} from "./rhDateUtils.js";

export const TIME_SHEET_ANCHOR_DAY = 22;

export interface TimeSheetPeriod {
  start_time: Date;
  end_time: Date;
}

function parseDateKey(value: string): { year: number; month: number } {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

function dateKeyForMonth(year: number, month: number): string {
  const normalized = new Date(Date.UTC(year, month - 1, TIME_SHEET_ANCHOR_DAY));
  return normalized.toISOString().slice(0, 10);
}

export function defaultTimeSheetPeriod(
  reference = new Date(),
  timezone = DEFAULT_ORGANIZATION_TIMEZONE,
): TimeSheetPeriod {
  const currentKey = organizationDateKey(reference, timezone);
  const { year, month } = parseDateKey(currentKey);
  const currentAnchorKey = dateKeyForMonth(year, month);
  const previousAnchorKey = dateKeyForMonth(
    month === 1 ? year - 1 : year,
    month === 1 ? 12 : month - 1,
  );
  const endDay = normalizeOrganizationDate(currentAnchorKey, timezone);

  return {
    start_time: normalizeOrganizationDate(previousAnchorKey, timezone),
    end_time: organizationDayBounds(endDay, timezone).end,
  };
}
