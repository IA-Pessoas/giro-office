import ExcelJS from "exceljs";

import type { ReportTable } from "./reportCsvService.js";

function cellValue(
  value: unknown,
  valueType?: ReportTable["columns"][number]["valueType"],
): unknown {
  if (valueType !== "date" || value instanceof Date || typeof value !== "string") return value;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date;
}

export class ReportXlsxService {
  async render(table: ReportTable): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Relatório");
    worksheet.columns = table.columns.map((column) => ({
      header: column.label,
      key: column.key,
    }));
    for (const row of table.rows) {
      worksheet.addRow(
        Object.fromEntries(
          table.columns.map((column) => [column.key, cellValue(row[column.key], column.valueType)]),
        ),
      );
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
