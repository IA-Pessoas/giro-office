export interface BirthdayCsvItem {
  name: string;
  day: number;
}

function csvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[\s]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function createCsv(rows: readonly (readonly (string | number)[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function createBirthdayCsv(items: readonly BirthdayCsvItem[]): string {
  return createCsv([["Nome", "Dia"], ...items.map((item) => [item.name, item.day])]);
}

/** `1990-05-31` → `31/05/1990`, como o relatório legado. */
export function formatBirthDate(birthDate: string): string {
  const [year, month, day] = birthDate.split("-");
  return `${day}/${month}/${year}`;
}

export function createMonthlyEmployeeBirthdayCsv(
  items: readonly { name: string; birthDate: string; department: string | null }[],
): string {
  return createCsv([
    ["Data", "Colaborador", "Departamento"],
    ...items.map((item) => [formatBirthDate(item.birthDate), item.name, item.department ?? "Sem departamento"]),
  ]);
}

export function createMonthlyClientBirthdayCsv(
  items: readonly { name: string; birthDate: string; companies: string }[],
): string {
  return createCsv([
    ["Data", "Cliente", "Empresa"],
    ...items.map((item) => [formatBirthDate(item.birthDate), item.name, item.companies]),
  ]);
}
