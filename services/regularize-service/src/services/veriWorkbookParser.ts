import { inflateRawSync } from "node:zlib";
import { read } from "@e965/xlsx";
import {
  error as logError,
  normalizeCpfCnpj,
  ServiceError,
  validateUploadFileSignature,
} from "@workspace/shared";

export const VERI_XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// XLSX é um ZIP: o limite de envio não basta, então o conteúdo é inflado com teto antes de
// chegar ao leitor de planilhas. O teto é baixo porque o Worker tem 128 MB de memória.
// ponytail: teto fixo de 8 MiB descompactados e 64 colunas; subir se um Veri real passar disso.
export const VERI_LIMITS = {
  bytes: 2 * 1024 * 1024,
  uncompressedBytes: 8 * 1024 * 1024,
  rows: 5000,
  columns: 64,
};

// Layout do relatorios/veri.php: dados da terceira linha em diante, razão social na coluna A
// e CNPJ na coluna C.
const FIRST_DATA_ROW = 2;
const NAME_COLUMN = 0;
const DOCUMENT_COLUMN = 2;

export interface VeriEntry {
  row: number;
  name: string;
  document: string;
}

export interface VeriInvalidEntry {
  row: number;
  name: string;
  value: string;
  reason: string;
}

export interface VeriWorkbook {
  entries: VeriEntry[];
  invalid: VeriInvalidEntry[];
}

type VeriCell = { t?: string; v?: unknown; w?: string } | undefined;

const ZIP_END_OF_DIRECTORY = 0x06054b50;
const ZIP_DIRECTORY_ENTRY = 0x02014b50;
const ZIP_LOCAL_ENTRY = 0x04034b50;
const ZIP_STORED = 0;
const ZIP_DEFLATED = 8;
const corrupted = () => new ServiceError(400, "XLSX ilegível ou corrompido.");
const tooLargeInflated = () =>
  new ServiceError(400, "O XLSX descompactado excede o limite de 8 MiB.");

// Infla cada entrada do ZIP com teto e recusa o arquivo que passa do limite. Os tamanhos
// declarados no ZIP não servem: com data descriptor eles podem mentir, e o leitor de
// planilhas infla o fluxo inteiro de qualquer forma.
function assertInflatedSizeWithinLimit(bytes: Buffer): void {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== ZIP_END_OF_DIRECTORY) end--;
  if (end < 0) throw corrupted();

  const entries = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  let total = 0;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== ZIP_DIRECTORY_ENTRY) {
      throw corrupted();
    }
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const local = bytes.readUInt32LE(offset + 42);
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== ZIP_LOCAL_ENTRY) {
      throw corrupted();
    }
    const data = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (method === ZIP_STORED) {
      total += Math.min(compressedSize, Math.max(0, bytes.length - data));
    } else if (method === ZIP_DEFLATED) {
      try {
        total += inflateRawSync(bytes.subarray(data), {
          maxOutputLength: VERI_LIMITS.uncompressedBytes - total + 1,
        }).length;
      } catch (err) {
        if ((err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") throw tooLargeInflated();
        throw corrupted();
      }
    } else {
      throw corrupted();
    }
    if (total > VERI_LIMITS.uncompressedBytes) throw tooLargeInflated();
    offset +=
      46 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
  }
}

function cellText(cell: VeriCell): string {
  return String(cell?.w ?? cell?.v ?? "").trim();
}

// Excel guarda CNPJ digitado sem máscara como número e perde os zeros à esquerda. Só se
// recupera quando falta um ou dois dígitos; número mais curto que isso continua inválido.
const PADDED_LENGTH_BY_DIGITS: Readonly<Record<number, number>> = { 9: 11, 10: 11, 12: 14, 13: 14 };

function documentOf(cell: VeriCell): string {
  const document = normalizeCpfCnpj(cell?.t === "n" ? String(cell.v) : cellText(cell));
  const paddedLength = cell?.t === "n" ? PADDED_LENGTH_BY_DIGITS[document.length] : undefined;
  return paddedLength ? document.padStart(paddedLength, "0") : document;
}

// Só a forma: CPF com 11 dígitos, CNPJ com 14 posições (o alfanumérico tem letras nas 12
// primeiras). O dígito verificador não é conferido, para não esconder um cadastro antigo
// que tenha o mesmo documento com dígito errado.
function isDocumentShaped(document: string): boolean {
  return /^\d{11}$/u.test(document) || /^[0-9A-Z]{12}\d{2}$/u.test(document);
}

export function parseVeriWorkbook(bytes: Buffer): VeriWorkbook {
  if (bytes.length > VERI_LIMITS.bytes) throw new ServiceError(413, "O XLSX excede 2 MiB.");
  validateUploadFileSignature({ buffer: bytes, mimetype: VERI_XLSX_MIME_TYPE });
  assertInflatedSizeWithinLimit(bytes);

  let rows: readonly (readonly VeriCell[] | undefined)[];
  try {
    const book = read(bytes, {
      type: "buffer",
      dense: true,
      sheets: 0,
      // Uma linha além do limite, para distinguir "cheia" de "linhas demais".
      sheetRows: FIRST_DATA_ROW + VERI_LIMITS.rows + 1,
      cellHTML: false,
      cellFormula: false,
    });
    rows = (book.Sheets[book.SheetNames[0] ?? ""]?.["!data"] ?? []) as typeof rows;
  } catch (err) {
    logError("Erro ao ler XLSX do comparador Veri", { err });
    throw new ServiceError(400, "XLSX ilegível, corrompido ou protegido.");
  }
  if (rows.length > FIRST_DATA_ROW + VERI_LIMITS.rows) {
    throw new ServiceError(400, "O XLSX excede o limite de 5.000 linhas de dados.");
  }
  if (rows.some((row) => (row?.length ?? 0) > VERI_LIMITS.columns)) {
    throw new ServiceError(400, "O XLSX excede o limite de 64 colunas.");
  }

  const entries: VeriEntry[] = [];
  const invalid: VeriInvalidEntry[] = [];
  const firstRowByDocument = new Map<string, number>();
  for (let index = FIRST_DATA_ROW; index < rows.length; index++) {
    const row = index + 1;
    const name = cellText(rows[index]?.[NAME_COLUMN]);
    const documentCell = rows[index]?.[DOCUMENT_COLUMN];
    const value = cellText(documentCell);
    const document = documentOf(documentCell);
    if (!name && !value) continue;

    const repeatedAt = firstRowByDocument.get(document);
    const reason = !value
      ? "CNPJ não informado."
      : !isDocumentShaped(document)
        ? "Não é um CPF (11 dígitos) nem um CNPJ (14 posições)."
        : repeatedAt !== undefined
          ? `CNPJ repetido; já aparece na linha ${repeatedAt}.`
          : null;
    if (reason) {
      invalid.push({ row, name, value, reason });
      continue;
    }
    firstRowByDocument.set(document, row);
    entries.push({ row, name, document });
  }
  return { entries, invalid };
}
