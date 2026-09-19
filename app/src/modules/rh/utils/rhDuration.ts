export interface RhDurationFormatOptions {
  showPositiveSign?: boolean;
}

export function formatRhDuration(
  totalMinutes: number | null | undefined,
  options?: RhDurationFormatOptions,
) {
  if (totalMinutes === null || totalMinutes === undefined) {
    return "-";
  }

  const sign = totalMinutes < 0 ? "-" : totalMinutes > 0 && options?.showPositiveSign ? "+" : "";
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  if (hours === 0) {
    return `${sign}${minutes}min`;
  }

  if (minutes === 0) {
    return `${sign}${hours}h`;
  }

  return `${sign}${hours}h ${minutes}min`;
}
