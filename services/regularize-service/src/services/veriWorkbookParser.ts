import { read, utils } from "@e965/xlsx";
import {
  error as logError,
  normalizeCpfCnpj,
  ServiceError,
  validateUploadFileSignature,
} from "@workspace/shared";

export const VERI_XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// XLSX é um ZIP: o limite de envio não basta, então o conteúdo descompactado também é limitado.
export const VERI_LIMITS = {
  bytes: 2 * 1024 * 1024,
  uncompressedBytes: 50 * 1024 * 1024,
  rows: 5000,
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

const ZIP_END_OF_DIRECTORY = 0x06054b50;
const ZIP_DIRECTORY_ENTRY = 0x02014b50;

// Soma o tamanho descompactado declarado no diretório central do ZIP, sem descompactar nada.
function declaredUncompressedBytes(bytes: Buffer): number {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== ZIP_END_OF_DIRECTORY) end--;
  if (end < 0) throw new ServiceError(400, "XLSX ilegível ou corrompido.");

  const entries = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  let total = 0;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== ZIP_DIRECTORY_ENTRY) {
      throw new ServiceError(400, "XLSX ilegível ou corrompido.");
    }
    total += bytes.readUInt32LE(offset + 24);
    offset +=
      46 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
  }
  return total;
}

function cellText(cell: { v?: unknown; w?: string } | undefined): string {
  return String(cell?.w ?? cell?.v ?? "").trim();
}

// Excel guarda CNPJ digitado sem máscara como número e perde o zero à esquerda.
function documentDigits(cell: { t?: string; v?: unknown; w?: string } | undefined): string {
  const digits = normalizeCpfCnpj(cell?.t === "n" ? String(cell.v) : cellText(cell));
  if (cell?.t !== "n" || digits.length === 0) return digits;
  return digits.padStart(digits.length > 11 ? 14 : 11, "0");
}

export function parseVeriWorkbook(bytes: Buffer): VeriWorkbook {
  if (bytes.length > VERI_LIMITS.bytes) throw new ServiceError(413, "O XLSX excede 2 MiB.");
  validateUploadFileSignature({ buffer: bytes, mimetype: VERI_XLSX_MIME_TYPE });
  if (declaredUncompressedBytes(bytes) > VERI_LIMITS.uncompressedBytes) {
    throw new ServiceError(400, "O XLSX descompactado excede o limite de 50 MiB.");
  }

  let book: ReturnType<typeof read>;
  try {
    book = read(bytes, {
      type: "buffer",
      sheets: 0,
      sheetRows: VERI_LIMITS.rows + FIRST_DATA_ROW + 1,
      cellHTML: false,
      cellFormula: false,
    });
  } catch (err) {
    logError("Erro ao ler XLSX do comparador Veri", { err });
    throw new ServiceError(400, "XLSX ilegível, corrompido ou protegido.");
  }

  const sheet = book.Sheets[book.SheetNames[0] ?? ""];
  if (!sheet?.["!ref"]) return { entries: [], invalid: [] };
  const lastRow = utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]).e.r;
  if (lastRow - FIRST_DATA_ROW + 1 > VERI_LIMITS.rows) {
    throw new ServiceError(400, "O XLSX excede o limite de 5.000 linhas de dados.");
  }

  const entries: VeriEntry[] = [];
  const invalid: VeriInvalidEntry[] = [];
  const firstRowByDocument = new Map<string, number>();
  for (let index = FIRST_DATA_ROW; index <= lastRow; index++) {
    const row = index + 1;
    const name = cellText(sheet[utils.encode_cell({ r: index, c: NAME_COLUMN })]);
    const documentCell = sheet[utils.encode_cell({ r: index, c: DOCUMENT_COLUMN })];
    const value = cellText(documentCell);
    const document = documentDigits(documentCell);
    if (!name && !value) continue;

    const repeatedAt = firstRowByDocument.get(document);
    const reason = !value
      ? "CNPJ não informado."
      : document.length !== 11 && document.length !== 14
        ? `CPF/CNPJ deve ter 11 ou 14 dígitos; a célula tem ${document.length}.`
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
