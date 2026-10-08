import { csvLine } from "@workspace/shared";

export interface ReportExportColumn {
  key: string;
  label: string;
  valueType?: "string" | "number" | "boolean" | "date";
}

export interface ReportTable {
  columns: readonly ReportExportColumn[];
  rows: readonly Record<string, unknown>[];
}

export class ReportCsvService {
  render(table: ReportTable): Buffer {
    const header = csvLine(table.columns.map((column) => column.label));
    const rows = table.rows.map((row) => csvLine(table.columns.map((column) => row[column.key])));
    return Buffer.from(`${[header, ...rows].join("\r\n")}\r\n`, "utf8");
  }
}
