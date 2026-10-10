import { crc32 } from "node:zlib";
import { error as logError, ServiceError } from "@workspace/shared";
import { DomUtils, parseDocument } from "htmlparser2";
import { type Entry, fromBuffer, type ZipFile } from "yauzl";

export const NOAH_LIMITS = {
  zipBytes: 5 * 1024 * 1024,
  entries: 100,
  fileBytes: 1024 * 1024,
  expandedBytes: 10 * 1024 * 1024,
  rows: 10_000,
} as const;

export interface NoahConversion {
  csv: string;
  rowCount: number;
  fileCount: number;
  rejections: Array<{ file: string; reason: string }>;
}

function csvCell(value: string): string {
  // Uma célula citada ainda pode ser executada como fórmula por uma planilha.
  const safe = /^[\s]*[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[;"\r\n]/u.test(safe) ? `"${safe.replace(/"/gu, '""')}"` : safe;
}

function paymentDate(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value);
  if (!match) return false;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
  );
}

function convertHtml(bytes: Buffer, file: string): string[] {
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    logError("Comprovante Noah requer decodificação Windows-1252");
    // DOMDocument do legado também recebe comprovantes em Windows-1252.
    html = new TextDecoder("windows-1252").decode(bytes);
  }
  const document = parseDocument(html);
  const tables = DomUtils.findAll(
    (node) => node.name === "table" && node.attribs.id === "TBLResultado",
    document.children,
  );
  if (tables.length !== 1) throw new ServiceError(400, "Esperada uma tabela TBLResultado.");
  const rows = DomUtils.getElementsByTagName("tr", tables[0].children);
  const output: string[] = [];
  for (const row of rows) {
    const cells = DomUtils.getElementsByTagName("td", row.children, false).map((cell) =>
      DomUtils.innerText(cell).trim(),
    );
    if (!cells.length) continue;
    const supplier = cells[0];
    if (["Nome do beneficiário", "Contribuinte", "Nome do favorecido"].includes(supplier)) {
      continue;
    }
    let date = cells[5] ?? "";
    let value = cells[6] ?? "";
    if (date === "0" || date === "0,00" || date.includes(",")) date = cells[4] ?? "";
    if (value.includes("/") || value === "Efetuado") value = cells[5] ?? "";
    if (!supplier || !paymentDate(date) || !/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/u.test(value)) {
      throw new ServiceError(400, "Comprovante contém fornecedor, data ou valor inválido.");
    }
    output.push([supplier, date, value, file].map(csvCell).join(";"));
    if (output.length > NOAH_LIMITS.rows) throw new ServiceError(400, "Limite de linhas excedido.");
  }
  if (!output.length) throw new ServiceError(400, "Nenhum pagamento válido na tabela.");
  return output;
}

async function readEntry(zip: ZipFile, entry: Entry): Promise<Buffer> {
  const stream = await new Promise<import("node:stream").Readable>((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream)));
  });
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > NOAH_LIMITS.fileBytes) throw new ServiceError(400, "Arquivo excede 1 MiB.");
      chunks.push(chunk);
    }
  } finally {
    stream.destroy();
  }
  const bytes = Buffer.concat(chunks);
  if (crc32(bytes) !== entry.crc32) throw new ServiceError(400, "Arquivo corrompido (CRC).");
  return bytes;
}

export async function convertNoahZip(bytes: Buffer): Promise<NoahConversion> {
  if (bytes.length > NOAH_LIMITS.zipBytes) throw new ServiceError(413, "O ZIP excede 5 MiB.");
  try {
    const zip = await new Promise<ZipFile>((resolve, reject) => {
      fromBuffer(bytes, { lazyEntries: true, strictFileNames: true }, (err, zip) =>
        err ? reject(err) : resolve(zip),
      );
    });
    try {
      if (zip.entryCount > NOAH_LIMITS.entries) {
        throw new ServiceError(400, "O ZIP excede 100 entradas.");
      }
      const result: NoahConversion = { csv: "", rowCount: 0, fileCount: 0, rejections: [] };
      const rows: string[] = [];
      const names = new Set<string>();
      let expanded = 0;
      let entries = 0;
      await new Promise<void>((resolve, reject) => {
        zip.on("error", reject);
        zip.on("end", resolve);
        zip.on("entry", (entry: Entry) => {
          async function processEntry(): Promise<void> {
            if (++entries > NOAH_LIMITS.entries) {
              throw new ServiceError(400, "O ZIP excede 100 entradas.");
            }
            expanded += entry.uncompressedSize;
            if (expanded > NOAH_LIMITS.expandedBytes) {
              throw new ServiceError(400, "O conteúdo expandido excede 10 MiB.");
            }
            if (entry.fileName.endsWith("/")) return;
            result.fileCount++;
            try {
              const file = entry.fileName;
              if (/[\p{Cc}:]/u.test(file) || file.length > 255) {
                throw new ServiceError(400, "Nome de arquivo inseguro.");
              }
              if (names.has(file)) throw new ServiceError(400, "Nome de arquivo duplicado.");
              names.add(file);
              if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) {
                throw new ServiceError(400, "Links simbólicos não são permitidos.");
              }
              if (!/\.html?$/iu.test(file))
                throw new ServiceError(400, "Esperado comprovante HTML.");
              if (entry.uncompressedSize > NOAH_LIMITS.fileBytes) {
                throw new ServiceError(400, "Arquivo excede 1 MiB.");
              }
              const converted = convertHtml(await readEntry(zip, entry), file);
              if (rows.length + converted.length > NOAH_LIMITS.rows) {
                throw new ServiceError(400, "Limite de 10.000 pagamentos excedido.");
              }
              rows.push(...converted);
            } catch (err) {
              logError("Comprovante Noah rejeitado", {
                code: err instanceof ServiceError ? err.statusCode : 400,
              });
              result.rejections.push({
                file: entry.fileName,
                reason:
                  err instanceof ServiceError
                    ? err.message
                    : "Arquivo corrompido ou não suportado.",
              });
            }
          }
          processEntry().then(() => zip.readEntry(), reject);
        });
        zip.readEntry();
      });
      if (!result.fileCount) throw new ServiceError(400, "O ZIP não contém comprovantes.");
      result.rowCount = rows.length;
      result.csv = `${["FORNECEDOR;DATA;VALOR;ARQUIVO", ...rows].join("\r\n")}\r\n`;
      return result;
    } finally {
      zip.close();
    }
  } catch (err) {
    logError("Falha ao converter ZIP Noah", {
      code: err instanceof ServiceError ? err.statusCode : 400,
    });
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(400, "ZIP inválido, corrompido ou com caminho inseguro.");
  }
}
