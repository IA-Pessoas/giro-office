import { ServiceError } from "@workspace/shared";

export const TimeUtils = {
  diffMinutes(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / 60_000);
  },

  /** Segunda=1 … domingo=7 (UTC), alinhado a work_days tipo "1,2,3,4,5". */
  utcWeekdayMon1ToSun7(d: Date): number {
    const day = d.getUTCDay();
    return day === 0 ? 7 : day;
  },

  getUtcDayBounds(reference: Date): { dayStart: Date; dayEnd: Date } {
    const y = reference.getUTCFullYear();
    const m = reference.getUTCMonth();
    const day = reference.getUTCDate();
    const dayStart = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
    return { dayStart, dayEnd };
  },

  parseWorkDaysSet(workDays: string): Set<string> {
    return new Set(
      workDays
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  },

  isWorkDayUtc(workDays: string, reference: Date): boolean {
    const set = TimeUtils.parseWorkDaysSet(workDays);
    if (set.size === 0) {
      return true;
    }
    const key = String(TimeUtils.utcWeekdayMon1ToSun7(reference));
    return set.has(key);
  },

  expectedMinutesFromConfig(config: {
    start_time: Date;
    lunch_break: Date;
    lunch_return: Date;
    end_time: Date;
  }): number {
    const morning = TimeUtils.diffMinutes(config.start_time, config.lunch_break);
    const afternoon = TimeUtils.diffMinutes(config.lunch_return, config.end_time);
    if (morning < 0 || afternoon < 0) {
      throw new ServiceError(500, "Configuração de ponto com horários inconsistentes.");
    }
    return morning + afternoon;
  },
};
