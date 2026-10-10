import {
  formatBrlDecimalInput,
  parseBrlDecimalInput,
} from "../../../shared/utils/inputFormatting.ts";

import type { PessoalLdd, PessoalLddImportPreview, PessoalLddImportRow } from "../types/tracking";

/** Tipo que o importador grava no servidor (`LDD_IMPORT_TYPE`): só ele compõe o saldo existente. */
export const LDD_IMPORT_TYPE = "INSS";

/** Mesmo teto do pessoal-service: cabe em base64 no corpo JSON de 1 MB do gateway. */
export const LDD_PDF_MAX_BYTES = 700 * 1024;

/** Linha da prévia em edição: os campos são o texto dos inputs. */
export interface LddImportDraftRow {
  line: number;
  source: string;
  period: string;
  due_date: string;
  balance_amount: string;
  /** Erros de leitura vindos do servidor; depois de editada, os da validação dos campos. */
  errors: string[];
}

export type LddImportDraftField = "period" | "due_date" | "balance_amount";

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
    errors: row.errors,
  }));
}

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(date.getTime())
    ? date.toISOString().startsWith(value)
    : false;
}

/** Erros dos campos editados: somem conforme o operador corrige. */
export function lddImportDraftRowErrors(
  row: Pick<LddImportDraftRow, LddImportDraftField>,
): string[] {
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

/** Aplica a edição de um campo e troca os erros de leitura pelos da validação. */
export function editLddImportDraftRow(
  row: LddImportDraftRow,
  field: LddImportDraftField,
  value: string,
): LddImportDraftRow {
  const edited = { ...row, [field]: value };
  return { ...edited, errors: lddImportDraftRowErrors(edited) };
}

/** Soma em centavos das linhas sem erro, para o total exibido não acumular erro de ponto flutuante. */
export function lddImportDraftTotal(rows: LddImportDraftRow[]): number {
  const cents = rows
    .filter((row) => row.errors.length === 0)
    .reduce((sum, row) => sum + Math.round((parseBrlDecimalInput(row.balance_amount) ?? 0) * 100), 0);
  return cents / 100;
}

const toCents = (value: number) => Math.round(value * 100);

/** Linhas sem erro, no formato da confirmação. */
export function buildLddImportRows(rows: LddImportDraftRow[]): PessoalLddImportRow[] {
  return rows
    .filter((row) => row.errors.length === 0)
    .map((row) => ({
      period: row.period.trim(),
      due_date: row.due_date,
      balance_amount: parseBrlDecimalInput(row.balance_amount) ?? 0,
    }));
}

export interface LddImportKeySummary {
  period: string;
  due_date: string;
  /** Saldo já cadastrado para a chave. */
  existing: number;
  /** Soma das linhas válidas da prévia para a chave. */
  increase: number;
  total: number;
}

/**
 * Saldo existente e acréscimo proposto por chave (competência, vencimento), como o servidor
 * grava: linhas da mesma chave somam e acrescem ao LDD previdenciário já cadastrado.
 */
export function summarizeLddImportByKey(
  rows: LddImportDraftRow[],
  existingLdd: Pick<PessoalLdd, "id" | "type" | "period" | "due_date" | "balance_amount">[],
): LddImportKeySummary[] {
  const increases = new Map<string, number>();
  for (const row of buildLddImportRows(rows)) {
    const key = `${row.period}|${row.due_date}`;
    increases.set(key, (increases.get(key) ?? 0) + toCents(row.balance_amount));
  }

  return [...increases].map(([key, increase]) => {
    const [period = "", due_date = ""] = key.split("|");
    // Com mais de um LDD na mesma chave, o servidor acresce no de menor id.
    const [target] = existingLdd
      .filter(
        (ldd) =>
          ldd.type === LDD_IMPORT_TYPE &&
          ldd.period === period &&
          ldd.due_date?.slice(0, 10) === due_date,
      )
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const existing = toCents(target?.balance_amount ?? 0);
    return {
      period,
      due_date,
      existing: existing / 100,
      increase: increase / 100,
      total: (existing + increase) / 100,
    };
  });
}
