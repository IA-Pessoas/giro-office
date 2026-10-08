// O input datetime-local trabalha em hora local sem fuso; a API exige ISO com offset.
export function toHistoryIsoDate(localValue: string | Date): string {
  return new Date(localValue).toISOString();
}

export function toDatetimeLocalValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}
