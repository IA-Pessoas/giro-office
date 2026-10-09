export interface BirthdayCsvItem {
  type: string;
  name: string;
  date: string;
  department: string;
}

function csvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[\s]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function createBirthdayCsv(items: readonly BirthdayCsvItem[]): string {
  return [
    ["Tipo", "Nome", "Data", "Departamento"].map(csvCell).join(","),
    ...items.map((item) =>
      [csvCell(item.type), csvCell(item.name), csvCell(item.date), csvCell(item.department)].join(","),
    ),
  ].join("\r\n");
}
