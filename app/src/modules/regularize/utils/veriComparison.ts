import type { RegularizeVeriComparison } from "../types";

// Mesmos limites do serviço (VERI_LIMITS e VERI_XLSX_MIME_TYPE em veriWorkbookParser.ts).
export const VERI_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const VERI_XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function formatDocument(document: string): string {
  if (document.length === 14) {
    return document.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/u, "$1.$2.$3/$4-$5");
  }
  if (document.length === 11) {
    return document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/u, "$1.$2.$3-$4");
  }
  return document;
}

function mark(present: boolean): string {
  return present ? "Sim" : "Não";
}

// Tela e CSV usam as mesmas colunas e linhas; os totais ficam no cabeçalho, como no legado.
export function veriComparisonColumns(totals: RegularizeVeriComparison["totals"]): string[] {
  return [
    "Razão social",
    "CPF/CNPJ",
    `Veri (${totals.veri})`,
    `Workspace (${totals.workspace})`,
    "Status",
  ];
}

export function veriComparisonRows(comparison: RegularizeVeriComparison): string[][] {
  return comparison.rows.map((row) => [
    row.name,
    formatDocument(row.document),
    mark(row.in_veri),
    mark(row.in_workspace),
    row.status,
  ]);
}
