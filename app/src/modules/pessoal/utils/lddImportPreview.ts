import {
  formatBrlDecimalInput,
  parseBrlDecimalInput,
} from "../../../shared/utils/inputFormatting.ts";

import type { PessoalLddImportPreview } from "../types/tracking";

/** Mesmo teto do pessoal-service: cabe em base64 no corpo JSON de 1 MB do gateway. */
export const LDD_PDF_MAX_BYTES = 700 * 1024;

/** Linha da prévia em edição: os campos são o texto dos inputs. */
export interface LddImportDraftRow {
  line: number;
  source: string;
  period: string;
  due_date: string;
  balance_amount: string;
}

export function validateLddPdfFile(file: { name: string; type: string; size: number }): string | null {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return "Selecione um arquivo PDF.";
  }
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > LDD_PDF_MAX_BYTES) return "O PDF excede o limite de 700 KB.";
  return null;
}

export function buildLddImportDraftRows(preview: PessoalLddImportPreview): LddImportDraftRow[] {
  return preview.rows.map((row) => ({
    line: row.line,
    source: row.source,
    period: row.period ?? "",
    due_date: row.due_date ?? "",
    balance_amount:
      row.balance_amount === null ? "" : formatBrlDecimalInput(row.balance_amount.toFixed(2)),
  }));
}

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(date.getTime())
    ? date.toISOString().startsWith(value)
    : false;
}

/** Erros da linha com os valores atuais: somem conforme o operador corrige. */
export function lddImportDraftRowErrors(row: LddImportDraftRow): string[] {
  const errors: string[] = [];
  const period = /^(\d{2})\/\d{4}$/u.exec(row.period.trim());
  // 13 é a competência do 13º.
  if (!period || Number(period[1]) < 1 || Number(period[1]) > 13) {
    errors.push("Informe a competência no formato MM/AAAA.");
  }
  if (!isCalendarDate(row.due_date)) errors.push("Informe um vencimento válido.");
  const amount = parseBrlDecimalInput(row.balance_amount);
  if (amount === null || amount <= 0) errors.push("Informe um valor maior que zero.");
  return errors;
}

/** Soma em centavos das linhas sem erro, para o total exibido não acumular erro de ponto flutuante. */
export function lddImportDraftTotal(rows: LddImportDraftRow[]): number {
  const cents = rows
    .filter((row) => lddImportDraftRowErrors(row).length === 0)
    .reduce((sum, row) => sum + Math.round((parseBrlDecimalInput(row.balance_amount) ?? 0) * 100), 0);
  return cents / 100;
}
