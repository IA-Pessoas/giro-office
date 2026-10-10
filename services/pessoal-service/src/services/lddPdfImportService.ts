import { ServiceError } from "@workspace/shared";
import { extractPdfText } from "@workspace/shared/pdf";

/**
 * Prévia da importação de LDD/INSS em PDF, com as regras de `Pdf::lerLdd` do legado: só as linhas
 * com `CP-` antes de "Débito com Exigibilidade Suspensa (SIEF)"; competência é o primeiro
 * `MM/AAAA`, vencimento o primeiro `DD/MM/AAAA` e o valor é o segundo valor monetário da linha.
 * Nada é gravado aqui. Sem amostra real de PDF, a paridade com o legado é só estrutural.
 */

/** Cabe, em base64, no limite de 1 MB de corpo JSON do gateway. */
export const LDD_PDF_MAX_BYTES = 700 * 1024;
export const LDD_PDF_MAX_BASE64_LENGTH = Math.ceil(LDD_PDF_MAX_BYTES / 3) * 4;

const SIEF_LIMIT = "Débito com Exigibilidade Suspensa (SIEF)";
const LINE_MARKER = "CP-";

export type LddImportPreviewRow = {
  /** Ordem da linha elegível no documento, a partir de 1. */
  line: number;
  /** Texto lido do PDF, para o operador conferir. */
  source: string;
  /** Competência `MM/AAAA`. */
  period: string | null;
  /** Vencimento `AAAA-MM-DD`. */
  due_date: string | null;
  balance_amount: number | null;
  errors: string[];
};

export type LddImportPreview = {
  file_name: string;
  rows: LddImportPreviewRow[];
};

function parsePeriod(line: string): string | null {
  // Não casa o MM/AAAA de dentro de uma data DD/MM/AAAA. 13 é a competência do 13º.
  const match = /(?<![\d/])(\d{2})\/(\d{4})(?!\d)/u.exec(line);
  if (!match) return null;
  const month = Number(match[1]);
  return month >= 1 && month <= 13 ? match[0] : null;
}

function parseDueDate(line: string): string | null {
  const match = /(?<!\d)(\d{2})\/(\d{2})\/(\d{4})(?!\d)/u.exec(line);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  // 31/02 vira março no Date: só vale a data que volta igual.
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

function parseAmount(line: string): number | null {
  // O legado lia `\d+,\d{2}` e cortava o milhar ("1.234,56" virava 234,56); aqui o valor é inteiro.
  const values = line.match(/\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}/gu) ?? [];
  const value = values[1];
  return value === undefined ? null : Number(value.replace(/\./gu, "").replace(",", "."));
}

export function parseLddText(pages: string[]): LddImportPreviewRow[] {
  const rows: LddImportPreviewRow[] = [];

  for (const source of pages.flatMap((page) => page.split("\n"))) {
    if (source.includes(SIEF_LIMIT)) break;
    if (!source.includes(LINE_MARKER)) continue;

    const period = parsePeriod(source);
    const due_date = parseDueDate(source);
    const balance_amount = parseAmount(source);
    const errors: string[] = [];
    if (period === null) errors.push("Competência não identificada na linha.");
    if (due_date === null) errors.push("Vencimento não identificado na linha.");
    if (balance_amount === null) errors.push("Valor não identificado na linha.");

    rows.push({ line: rows.length + 1, source, period, due_date, balance_amount, errors });
  }

  return rows;
}

export function buildLddImportPreview(input: {
  file_name: string;
  content_base64: string;
}): LddImportPreview {
  const pdf = Buffer.from(input.content_base64, "base64");
  if (pdf.length > LDD_PDF_MAX_BYTES) {
    throw new ServiceError(413, "O PDF excede o limite de 700 KB.");
  }

  const text = extractPdfText(pdf);
  if (text.kind === "unsupported") {
    throw new ServiceError(422, text.message);
  }
  if (text.unreadable_pages.length > 0) {
    throw new ServiceError(
      422,
      `Página(s) ${text.unreadable_pages.join(", ")} sem texto legível (escaneada ou fonte sem mapa); pode haver débito nela.`,
    );
  }

  const rows = parseLddText(text.pages);
  if (rows.length === 0) {
    throw new ServiceError(
      422,
      `Nenhuma linha CP- encontrada antes de "${SIEF_LIMIT}". Confira se o arquivo é o relatório LDD/INSS.`,
    );
  }

  return { file_name: input.file_name, rows };
}
