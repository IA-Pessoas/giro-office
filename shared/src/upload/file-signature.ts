import { ServiceError } from "../http/errors.js";

export interface UploadFileForSignatureValidation {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
}

const OOXML_ENTRIES_BY_MIME_TYPE: Record<string, readonly string[]> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
  ],
};

const COMPOUND_FILE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const COMPOUND_FILE_FREE_SECTOR = 0xffffffff;
const COMPOUND_FILE_END_OF_CHAIN = 0xfffffffe;

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function startsWithAscii(buffer: Buffer, value: string, offset = 0): boolean {
  return buffer.subarray(offset, offset + value.length).toString("ascii") === value;
}

function hasValidTextContent(buffer: Buffer): boolean {
  return !buffer.includes(0);
}

function hasCompoundFileStream(buffer: Buffer, expectedStream: string): boolean {
  if (
    buffer.length < 512 ||
    !startsWithBytes(buffer, COMPOUND_FILE_SIGNATURE) ||
    buffer.readUInt16LE(28) !== 0xfffe
  ) {
    return false;
  }

  const sectorShift = buffer.readUInt16LE(30);
  if (sectorShift !== 9 && sectorShift !== 12) return false;
  const sectorSize = 1 << sectorShift;
  const sectorCount = Math.floor((buffer.length - 512) / sectorSize);
  const fatSectorCount = buffer.readUInt32LE(44);
  if (sectorCount === 0 || fatSectorCount === 0 || fatSectorCount > sectorCount) return false;

  const fatSectors: number[] = [];
  const addFatSector = (sector: number): boolean => {
    if (sector === COMPOUND_FILE_FREE_SECTOR) return true;
    if (sector >= sectorCount || fatSectors.length >= fatSectorCount) return false;
    fatSectors.push(sector);
    return true;
  };

  for (let index = 0; index < 109 && fatSectors.length < fatSectorCount; index += 1) {
    if (!addFatSector(buffer.readUInt32LE(76 + index * 4))) return false;
  }

  let difatSector = buffer.readUInt32LE(68);
  const difatSectors = new Set<number>();
  const entriesPerSector = sectorSize / 4;
  while (fatSectors.length < fatSectorCount && difatSector !== COMPOUND_FILE_END_OF_CHAIN) {
    if (difatSector >= sectorCount || difatSectors.has(difatSector)) return false;
    difatSectors.add(difatSector);
    const difatOffset = 512 + difatSector * sectorSize;
    for (
      let index = 0;
      index < entriesPerSector - 1 && fatSectors.length < fatSectorCount;
      index += 1
    ) {
      if (!addFatSector(buffer.readUInt32LE(difatOffset + index * 4))) return false;
    }
    difatSector = buffer.readUInt32LE(difatOffset + sectorSize - 4);
  }
  if (fatSectors.length !== fatSectorCount) return false;

  const nextSector = (sector: number): number | undefined => {
    if (sector >= sectorCount) return undefined;
    const fatIndex = Math.floor(sector / entriesPerSector);
    const fatSector = fatSectors[fatIndex];
    if (fatSector === undefined) return undefined;
    return buffer.readUInt32LE(512 + fatSector * sectorSize + (sector % entriesPerSector) * 4);
  };

  let directorySector = buffer.readUInt32LE(48);
  const directorySectors = new Set<number>();
  while (directorySector !== COMPOUND_FILE_END_OF_CHAIN) {
    if (directorySector >= sectorCount || directorySectors.has(directorySector)) return false;
    directorySectors.add(directorySector);
    const directoryOffset = 512 + directorySector * sectorSize;
    for (
      let entryOffset = directoryOffset;
      entryOffset < directoryOffset + sectorSize;
      entryOffset += 128
    ) {
      const nameLength = buffer.readUInt16LE(entryOffset + 64);
      if (
        nameLength < 2 ||
        nameLength > 64 ||
        nameLength % 2 !== 0 ||
        buffer[entryOffset + 66] !== 2
      ) {
        continue;
      }
      const name = buffer.subarray(entryOffset, entryOffset + nameLength - 2).toString("utf16le");
      const startSector = buffer.readUInt32LE(entryOffset + 116);
      if (
        name === expectedStream &&
        buffer.readBigUInt64LE(entryOffset + 120) > 0n &&
        startSector < sectorCount
      ) {
        return true;
      }
    }
    const next = nextSector(directorySector);
    if (next === undefined) return false;
    directorySector = next;
  }

  return false;
}

function hasOoxmlEntries(buffer: Buffer, expectedEntries: readonly string[]): boolean {
  const endOfCentralDirectory = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const centralDirectorySignature = 0x02014b50;
  const localFileHeaderSignature = 0x04034b50;
  const endOffset = buffer.lastIndexOf(endOfCentralDirectory);
  if (endOffset < 0 || endOffset + 22 > buffer.length) return false;

  const entriesCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const entries = new Set<string>();

  for (let index = 0; index < entriesCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== centralDirectorySignature) {
      return false;
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nextOffset = nameStart + nameLength + extraLength + commentLength;
    if (nextOffset > buffer.length) return false;
    const name = buffer.subarray(nameStart, nameStart + nameLength);
    if (
      localHeaderOffset + 30 > buffer.length ||
      buffer.readUInt32LE(localHeaderOffset) !== localFileHeaderSignature
    ) {
      return false;
    }
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const localNameStart = localHeaderOffset + 30;
    if (
      localNameStart + localNameLength + localExtraLength > buffer.length ||
      !buffer.subarray(localNameStart, localNameStart + localNameLength).equals(name)
    ) {
      return false;
    }
    entries.add(name.toString("utf8"));
    offset = nextOffset;
  }

  return expectedEntries.every((entry) => entries.has(entry));
}

function hasValidSignature(file: UploadFileForSignatureValidation): boolean {
  const { buffer, mimetype } = file;

  if (buffer.length === 0) {
    return false;
  }

  if (mimetype === "image/jpeg") {
    return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  }

  if (mimetype === "image/png") {
    return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  if (mimetype === "image/webp") {
    return (
      buffer.length >= 12 && startsWithAscii(buffer, "RIFF") && startsWithAscii(buffer, "WEBP", 8)
    );
  }

  if (mimetype === "application/pdf") {
    return startsWithAscii(buffer, "%PDF-");
  }

  if (mimetype === "application/msword") {
    return hasCompoundFileStream(buffer, "WordDocument");
  }

  if (mimetype === "application/vnd.ms-excel") {
    return hasCompoundFileStream(buffer, "Workbook");
  }

  const ooxmlEntries = OOXML_ENTRIES_BY_MIME_TYPE[mimetype];
  if (ooxmlEntries) {
    return hasOoxmlEntries(buffer, ooxmlEntries);
  }

  if (mimetype === "text/plain" || mimetype === "text/csv") {
    return hasValidTextContent(buffer);
  }

  return true;
}

export function validateUploadFileSignature(file: UploadFileForSignatureValidation): void {
  if (!hasValidSignature(file)) {
    throw new ServiceError(400, "Assinatura do arquivo não corresponde ao tipo informado.");
  }
}

export function validateOptionalUploadFileSignature(
  file: UploadFileForSignatureValidation | undefined,
): void {
  if (file) {
    validateUploadFileSignature(file);
  }
}
