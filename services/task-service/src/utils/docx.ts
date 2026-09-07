import { inflateRawSync } from "node:zlib";

import { ServiceError } from "@workspace/shared";

/**
 * Extrai apenas o texto corrido de um DOCX (OOXML).
 *
 * Lê exclusivamente `word/document.xml` e, dentro dele, somente os nós `<w:t>`.
 * Macros (`word/vbaProject.bin`), campos ativos (`<w:instrText>`, incluindo
 * HYPERLINK), OLE objects e demais partes do pacote são ignorados: nada é
 * executado nem repassado adiante como comando.
 */
const CORRUPTED_MESSAGE = "O arquivo DOCX está corrompido ou não pôde ser lido.";
const ENCRYPTED_MESSAGE = "O arquivo DOCX está protegido por senha e não pode ser lido.";
const EMPTY_MESSAGE = "O arquivo DOCX não contém texto.";

/** Container OLE/CFB usado pelo OOXML protegido por senha. */
const CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_LOCAL_FILE_SIGNATURE = Buffer.from("PK\x03\x04", "latin1");
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const ZIP_MAX_COMMENT_SIZE = 0xffff;
const DOCUMENT_ENTRY_NAME = "word/document.xml";
/** Limite de descompressão: barra zip bombs bem antes de estourar a memória. */
const MAX_DOCUMENT_XML_BYTES = 32 * 1024 * 1024;

const STORED = 0;
const DEFLATED = 8;

function findEndOfCentralDirectory(zip: Buffer): number {
  const last = zip.length - ZIP_END_OF_CENTRAL_DIRECTORY_SIZE;
  const first = Math.max(0, last - ZIP_MAX_COMMENT_SIZE);

  for (let offset = last; offset >= first; offset -= 1) {
    if (zip.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }

  return -1;
}

function readEntryData(zip: Buffer, localOffset: number, method: number, size: number): Buffer {
  const nameLength = zip.readUInt16LE(localOffset + 26);
  const extraLength = zip.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const data = zip.subarray(start, start + size);

  if (data.length !== size) throw new ServiceError(400, CORRUPTED_MESSAGE);
  if (method === STORED) return data;
  if (method === DEFLATED) {
    return inflateRawSync(data, { maxOutputLength: MAX_DOCUMENT_XML_BYTES });
  }

  throw new ServiceError(400, CORRUPTED_MESSAGE);
}

/** Localiza `word/document.xml` pelo diretório central do ZIP. */
function readDocumentXml(zip: Buffer): Buffer {
  const endOffset = findEndOfCentralDirectory(zip);
  if (endOffset < 0) throw new ServiceError(400, CORRUPTED_MESSAGE);

  const entries = zip.readUInt16LE(endOffset + 10);
  let cursor = zip.readUInt32LE(endOffset + 16);

  for (let index = 0; index < entries; index += 1) {
    if (zip.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new ServiceError(400, CORRUPTED_MESSAGE);
    }

    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (name === DOCUMENT_ENTRY_NAME) {
      return readEntryData(zip, localOffset, method, compressedSize);
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  // ZIP válido sem a parte principal do OOXML: assinatura divergente.
  throw new ServiceError(400, CORRUPTED_MESSAGE);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function documentXmlToText(xml: string): string {
  return xml
    .split("</w:p>")
    .map((paragraph) =>
      [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((match) => decodeXmlEntities(match[1]))
        .join(""),
    )
    .join("\n")
    .trim();
}

export function extractDocxText(file: Buffer): string {
  if (file.subarray(0, CFB_SIGNATURE.length).equals(CFB_SIGNATURE)) {
    throw new ServiceError(400, ENCRYPTED_MESSAGE);
  }
  if (!file.subarray(0, ZIP_LOCAL_FILE_SIGNATURE.length).equals(ZIP_LOCAL_FILE_SIGNATURE)) {
    throw new ServiceError(400, CORRUPTED_MESSAGE);
  }

  let documentXml: Buffer;
  try {
    documentXml = readDocumentXml(file);
  } catch (err) {
    // RangeError de offsets fora do buffer e falhas de inflate viram erro acionável.
    throw err instanceof ServiceError ? err : new ServiceError(400, CORRUPTED_MESSAGE);
  }

  const text = documentXmlToText(documentXml.toString("utf8"));
  if (!text) throw new ServiceError(400, EMPTY_MESSAGE);

  return text;
}
