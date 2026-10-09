import { inflateRawSync } from "node:zlib";

import { ServiceError } from "@workspace/shared";

/**
 * Leitor de ZIP para arquivos enviados à conferência (RT-05): lê pelo diretório central, valida
 * nomes, tamanho descompactado e método, e devolve erro por entrada sem descartar as demais.
 * Roda em Node e nos Workers (node:zlib via nodejs_compat). Não suporta ZIP64 nem multivolume.
 */

export interface ZipArchiveEntry {
  name: string;
  body: Buffer;
}

export interface ZipArchive {
  entries: ZipArchiveEntry[];
  errors: { entry: string; message: string }[];
}

export interface ZipLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}

// ponytail: tetos fixos para uma requisição síncrona; um lote maior pede processamento assíncrono.
const DEFAULT_LIMITS: ZipLimits = {
  maxEntries: 2000,
  maxEntryBytes: 2 * 1024 * 1024,
  maxTotalBytes: 30 * 1024 * 1024,
};

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;

const invalid = (detail: string) => new ServiceError(400, `ZIP inválido: ${detail}.`);

function isUnsafeName(name: string): boolean {
  return (
    name === "" ||
    name.startsWith("/") ||
    /^[a-z]:/iu.test(name) ||
    name.includes("\\") ||
    /\p{Cc}/u.test(name) ||
    name.split("/").includes("..")
  );
}

function findEndOfCentralDirectory(zip: Buffer): number {
  // O registro final tem 22 bytes mais um comentário de até 65535.
  for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 65_557); offset -= 1) {
    if (zip.readUInt32LE(offset) === END_SIGNATURE) return offset;
  }
  throw invalid("registro final não encontrado");
}

export function readZipArchive(zip: Buffer, limits: Partial<ZipLimits> = {}): ZipArchive {
  const { maxEntries, maxEntryBytes, maxTotalBytes } = { ...DEFAULT_LIMITS, ...limits };
  if (zip.length < 22) throw invalid("arquivo curto demais");

  const end = findEndOfCentralDirectory(zip);
  const count = zip.readUInt16LE(end + 10);
  const centralSize = zip.readUInt32LE(end + 12);
  const centralOffset = zip.readUInt32LE(end + 16);
  if (zip.readUInt16LE(end + 4) !== 0 || zip.readUInt16LE(end + 6) !== 0) {
    throw invalid("ZIP em vários volumes não é suportado");
  }
  if (count === 0xffff || centralOffset === 0xffffffff) {
    throw invalid("ZIP64 não é suportado");
  }
  if (centralOffset + centralSize > end) throw invalid("diretório central fora do arquivo");
  if (count > maxEntries) {
    throw new ServiceError(400, `ZIP com ${count} arquivos; o limite é ${maxEntries}.`);
  }

  const archive: ZipArchive = { entries: [], errors: [] };
  const seen = new Set<string>();
  let total = 0;
  let cursor = centralOffset;

  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > end || zip.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw invalid("diretório central corrompido");
    }
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString(flags & UTF8_FLAG ? "utf8" : "latin1");
    cursor += 46 + nameLength + extraLength + commentLength;

    const fail = (message: string) => archive.errors.push({ entry: name, message });
    if (isUnsafeName(name)) {
      fail("Nome de arquivo inseguro no ZIP.");
      continue;
    }
    if (name.endsWith("/")) continue;
    if (seen.has(name)) {
      fail("Nome repetido no ZIP.");
      continue;
    }
    seen.add(name);
    if (flags & 1) {
      fail("Arquivo criptografado não é suportado.");
      continue;
    }
    if (method !== 0 && method !== 8) {
      fail("Método de compressão não suportado.");
      continue;
    }
    if (size > maxEntryBytes) {
      fail(`Arquivo descompactado excede o limite de ${maxEntryBytes} bytes.`);
      continue;
    }
    total += size;
    if (total > maxTotalBytes) {
      throw new ServiceError(400, `ZIP descompactado excede o limite de ${maxTotalBytes} bytes.`);
    }

    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      fail("Arquivo corrompido no ZIP.");
      continue;
    }
    const start =
      localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const data = zip.subarray(start, start + compressedSize);
    let body: Buffer;
    try {
      // O tamanho declarado não é confiável (zip bomb): a saída é cortada no limite.
      body = method === 0 ? Buffer.from(data) : inflateRawSync(data, { maxOutputLength: size + 1 });
    } catch {
      fail("Arquivo corrompido no ZIP.");
      continue;
    }
    // ponytail: confere tamanho, não CRC32; corpo adulterado com o mesmo tamanho passa e cai no
    // parse do XML. Verificar CRC se o ZIP passar a ser entregue sem reprocessar o conteúdo.
    if (data.length !== compressedSize || body.length !== size) {
      fail("Arquivo corrompido no ZIP.");
      continue;
    }
    archive.entries.push({ name, body });
  }
  return archive;
}
