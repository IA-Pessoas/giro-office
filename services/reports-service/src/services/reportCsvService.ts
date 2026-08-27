export interface ReportExportColumn {
  key: string;
  label: string;
  valueType?: "string" | "number" | "boolean" | "date";
}

export interface ReportTable {
  columns: readonly ReportExportColumn[];
  rows: readonly Record<string, unknown>[];
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return typeof value === "string" && /^\s*[=+\-@]/u.test(text) ? `'${text}` : text;
}

function escapeCell(value: unknown): string {
  const text = cellText(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export class ReportCsvService {
  render(table: ReportTable): Buffer {
    const header = table.columns.map((column) => escapeCell(column.label)).join(",");
    const rows = table.rows.map((row) =>
      table.columns.map((column) => escapeCell(row[column.key])).join(","),
    );
    return Buffer.from(`${[header, ...rows].join("\r\n")}\r\n`, "utf8");
  }
}
