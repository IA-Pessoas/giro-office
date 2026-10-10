import { createHash } from "node:crypto";

import { error as logError, ServiceError } from "@workspace/shared";
import { extractPdfText } from "@workspace/shared/pdf";

import type { ConfirmLddImportBody } from "../schemas/ldd.schemas.js";
import type { PessoalAuthContext } from "./pessoalServiceTypes.js";
import { requireUserId } from "./pessoalServiceTypes.js";

/**
 * Prévia da importação de LDD/INSS em PDF, com as regras de `Pdf::lerLdd` do legado: só as linhas
 * com `CP-` antes de "Débito com Exigibilidade Suspensa (SIEF)"; competência é o primeiro
 * `MM/AAAA`, vencimento o primeiro `DD/MM/AAAA` e o valor é o segundo valor monetário da linha.
 * A prévia não grava nada. Sem amostra real de PDF, a paridade com o legado é só estrutural.
 *
 * A confirmação grava as linhas revisadas como LDD previdenciário: linhas da mesma chave
 * (cliente, tipo, competência, vencimento) somam, e a soma acresce ao saldo já cadastrado, como
 * em `Pessoal::cadastrarLdd`. O hash do arquivo fica em `pessoal.ldd_imports`, único por
 * organização e cliente: o mesmo PDF não soma duas vezes.
 */

/** Tipo gravado pelo importador de PDF; PGFN segue pelo cadastro manual. */
export const LDD_IMPORT_TYPE = "INSS";
export const LDD_IMPORT_AUDIT_REFERRING = "pessoal.ldd_import";

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
  /** SHA-256 do arquivo: identifica o PDF na confirmação e no bloqueio de reenvio. */
  file_hash: string;
  rows: LddImportPreviewRow[];
};

export type LddImportedRecord = {
  id: string;
  period: string;
  due_date: string;
  balance_amount: number;
};

export type LddImportResult = {
  import_id: string;
  rows_count: number;
  total_amount: number;
  records: LddImportedRecord[];
};

type LddImportScope = { organization_id: string; client_id: string };

/** O que a confirmação usa do Prisma (cliente ou transação), no serviço e no Worker. */
export type LddImportStore = {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  lddImportPessoal: {
    findFirst(args: {
      where: LddImportScope & { file_hash: string };
      select: { created_at: true };
    }): Promise<{ created_at: Date } | null>;
    create(args: {
      data: LddImportScope & {
        file_hash: string;
        file_name: string;
        rows_count: number;
        total_amount: number;
        imported_by_id: string;
      };
    }): Promise<{ id: string }>;
  };
  lddPessoal: {
    findFirst(args: {
      where: LddImportScope & { type: string; period: string; due_date: { gte: Date; lt: Date } };
      orderBy: { id: "asc" };
      select: { id: true; balance_amount: true };
    }): Promise<{ id: string; balance_amount: number | null } | null>;
    create(args: {
      data: LddImportScope & {
        type: string;
        period: string;
        due_date: Date;
        balance_amount: number;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
    update(args: {
      where: { id: string };
      data: { balance_amount: number };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
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
    if (parsed.balance_amount === 0) errors.push("Valor zerado na linha.");

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
  const pdf = Buffer.from(input.content_base64, "base64");
  const text = extractPdfText(pdf);
  if (text.kind === "unsupported") {
    throw new ServiceError(422, text.message);
  }

  return {
    file_name: input.file_name,
    file_hash: createHash("sha256").update(pdf).digest("hex"),
    rows: lddRowsFromPdfText(text.pages, text.unreadable_pages),
  };
}

const ALREADY_IMPORTED = "Este PDF já foi importado para este cliente; o saldo não foi alterado.";
const toCents = (value: number) => Math.round(value * 100);

/** Quando o mesmo arquivo já foi importado para o cliente, a data da importação. */
export async function findLddImportDate(
  store: Pick<LddImportStore, "lddImportPessoal">,
  key: { organizationId: string; clientId: string; fileHash: string },
): Promise<Date | null> {
  const previous = await store.lddImportPessoal.findFirst({
    where: {
      organization_id: key.organizationId,
      client_id: key.clientId,
      file_hash: key.fileHash,
    },
    select: { created_at: true },
  });
  return previous?.created_at ?? null;
}

/**
 * Grava a importação confirmada. Chame dentro de uma transação: o registro do arquivo e os
 * saldos entram juntos ou não entram. As importações do mesmo cliente rodam uma por vez (trava
 * de transação), então duas confirmações simultâneas não perdem acréscimo nem duplicam a chave;
 * o índice único do arquivo continua sendo a garantia final contra o reenvio.
 * Havendo mais de um LDD cadastrado à mão na mesma chave, o acréscimo vai no de menor id.
 * O servidor confia no `file_hash` da prévia: quem confirma já pode cadastrar LDD à mão.
 * ponytail: edição manual do mesmo LDD no meio da importação ainda pode se sobrepor; se
 * acontecer, travar a linha (SELECT ... FOR UPDATE) ou versionar o saldo.
 */
export async function confirmLddImport(
  store: LddImportStore,
  context: PessoalAuthContext,
  body: ConfirmLddImportBody,
): Promise<LddImportResult> {
  const userId = requireUserId(context);
  const scope = { organization_id: context.organizationId, client_id: body.client_id };
  await store.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["pessoal.ldd_import", scope.organization_id, scope.client_id])}, 0))`;
  const imported = await findLddImportDate(store, {
    organizationId: context.organizationId,
    clientId: body.client_id,
    fileHash: body.file_hash,
  });
  if (imported) throw new ServiceError(409, ALREADY_IMPORTED);

  // Soma em centavos por chave: linhas distintas do mesmo documento compõem o total.
  const centsByKey = new Map<string, number>();
  for (const row of body.rows) {
    const key = `${row.period}|${row.due_date}`;
    centsByKey.set(key, (centsByKey.get(key) ?? 0) + toCents(row.balance_amount));
  }
  const totalCents = [...centsByKey.values()].reduce((sum, cents) => sum + cents, 0);

  let created: { id: string };
  try {
    created = await store.lddImportPessoal.create({
      data: {
        ...scope,
        file_hash: body.file_hash,
        file_name: body.file_name,
        rows_count: body.rows.length,
        total_amount: totalCents / 100,
        imported_by_id: userId,
      },
    });
  } catch (err: unknown) {
    logError("Erro ao registrar arquivo de importação de LDD", { err });
    if ((err as { code?: unknown }).code === "P2002") throw new ServiceError(409, ALREADY_IMPORTED);
    throw err;
  }

  const records: LddImportedRecord[] = [];
  for (const [key, cents] of centsByKey) {
    const [period = "", dueDate = ""] = key.split("|");
    const dayStart = new Date(`${dueDate}T00:00:00.000Z`);
    const existing = await store.lddPessoal.findFirst({
      where: {
        ...scope,
        type: LDD_IMPORT_TYPE,
        period,
        due_date: { gte: dayStart, lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) },
      },
      orderBy: { id: "asc" },
      select: { id: true, balance_amount: true },
    });
    const balance = (toCents(existing?.balance_amount ?? 0) + cents) / 100;
    const saved = existing
      ? await store.lddPessoal.update({
          where: { id: existing.id },
          data: { balance_amount: balance },
          select: { id: true },
        })
      : await store.lddPessoal.create({
          data: {
            ...scope,
            type: LDD_IMPORT_TYPE,
            period,
            due_date: dayStart,
            balance_amount: balance,
          },
          select: { id: true },
        });
    records.push({ id: saved.id, period, due_date: dueDate, balance_amount: balance });
  }

  return {
    import_id: created.id,
    rows_count: body.rows.length,
    total_amount: totalCents / 100,
    records,
  };
}
