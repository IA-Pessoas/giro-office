export interface BirthdayCsvItem {
  name: string;
  day: number;
}

function csvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[\s]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function createBirthdayCsv(items: readonly BirthdayCsvItem[]): string {
  return [
    ["Nome", "Dia"].map(csvCell).join(","),
    ...items.map((item) => [csvCell(item.name), csvCell(item.day)].join(",")),
  ].join("\r\n");
}
