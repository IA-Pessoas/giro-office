import { ServiceError } from "@workspace/shared";
import { extractPdfText } from "@workspace/shared/pdf";

/**
 * Prévia da importação de LDD/INSS em PDF, com as regras de `Pdf::lerLdd` do legado: só as linhas
 * com `CP-` antes de "Débito com Exigibilidade Suspensa (SIEF)"; competência é o primeiro
 * `MM/AAAA`, vencimento o primeiro `DD/MM/AAAA` e o valor é o segundo valor monetário da linha.
 * Nada é gravado aqui. Sem amostra real de PDF, a paridade com o legado é só estrutural.
 */

export const SIEF_LIMIT = "Débito com Exigibilidade Suspensa (SIEF)";
const LINE_MARKER = "CP-";
/** Quantas linhas de texto seguintes podem completar uma linha CP- quebrada em células. */
const MAX_CELL_LINES = 8;

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
  for (const match of line.matchAll(/(?<![\d/])(\d{2})\/\d{4}(?!\d)/gu)) {
    const month = Number(match[1]);
    if (month >= 1 && month <= 13) return match[0];
  }
  return null;
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
  const lines = pages.flatMap((page) => page.split("\n"));
  const fields = (source: string) => ({
    period: parsePeriod(source),
    due_date: parseDueDate(source),
    balance_amount: parseAmount(source),
  });
  const complete = (parsed: ReturnType<typeof fields>) =>
    parsed.period !== null && parsed.due_date !== null && parsed.balance_amount !== null;

  for (const [index, line] of lines.entries()) {
    if (line.includes(SIEF_LIMIT)) break;
    if (!line.includes(LINE_MARKER)) continue;

    let source = line;
    let parsed = fields(source);
    // PDF de relatório pode trazer cada célula da tabela como uma linha de texto: completa a
    // linha CP- com as seguintes, sem passar da próxima CP- nem do limite SIEF.
    // ponytail: heurística por texto; com amostra real, ler as células pela posição no PDF.
    for (const next of lines.slice(index + 1, index + 1 + MAX_CELL_LINES)) {
      if (complete(parsed) || next.includes(LINE_MARKER) || next.includes(SIEF_LIMIT)) break;
      const joined = fields(`${source} ${next}`);
      source = `${source} ${next}`;
      parsed = joined;
    }
    // Não fechou nem juntando: mostra só a linha lida, com os erros dela.
    if (!complete(parsed)) {
      source = line;
      parsed = fields(line);
    }

    const errors: string[] = [];
    if (parsed.period === null) errors.push("Competência não identificada na linha.");
    if (parsed.due_date === null) errors.push("Vencimento não identificado na linha.");
    if (parsed.balance_amount === null) errors.push("Valor não identificado na linha.");

    rows.push({ line: rows.length + 1, source, ...parsed, errors });
  }

  return rows;
}

/** Linhas da prévia a partir do texto do PDF; recusa o que não dá para revisar com segurança. */
export function lddRowsFromPdfText(
  pages: string[],
  unreadablePages: number[],
): LddImportPreviewRow[] {
  // Depois do limite SIEF o legado já parou de ler: página ilegível ali não esconde débito.
  const siefIndex = pages.findIndex((page) => page.includes(SIEF_LIMIT));
  const hidden = unreadablePages.filter((page) => siefIndex === -1 || page <= siefIndex);
  if (hidden.length > 0) {
    throw new ServiceError(
      422,
      `Página(s) ${hidden.join(", ")} sem texto legível (escaneada ou fonte sem mapa); pode haver débito nela.`,
    );
  }

  const rows = parseLddText(pages);
  if (rows.length === 0) {
    throw new ServiceError(
      422,
      `Nenhuma linha CP- encontrada antes de "${SIEF_LIMIT}". Confira se o arquivo é o relatório LDD/INSS.`,
    );
  }

  return rows;
}

/** O tamanho do arquivo já foi limitado no schema da rota (`previewLddImportBodySchema`). */
export function buildLddImportPreview(input: {
  file_name: string;
  content_base64: string;
}): LddImportPreview {
  const text = extractPdfText(Buffer.from(input.content_base64, "base64"));
  if (text.kind === "unsupported") {
    throw new ServiceError(422, text.message);
  }

  return {
    file_name: input.file_name,
    rows: lddRowsFromPdfText(text.pages, text.unreadable_pages),
  };
}
