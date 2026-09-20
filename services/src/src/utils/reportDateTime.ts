const REPORT_TIME_ZONE = "America/Sao_Paulo";

const reportDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: REPORT_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const reportDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: REPORT_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatReportDate(date: Date): string {
  return reportDateFormatter.format(date);
}

export function formatReportDateTime(date: Date): string {
  const parts = reportDateTimeFormatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("day")}/${getPart("month")}/${getPart("year")} ${getPart("hour")}:${getPart(
    "minute",
  )}`;
}
