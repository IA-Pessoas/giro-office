import { inflateRawSync } from "node:zlib";

/** Lê as entradas de um ZIP gerado por createZip (deflate, sem data descriptor). */
export function readZipEntries(body: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 4 <= body.length && body.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = body.readUInt32LE(offset + 18);
    const nameLength = body.readUInt16LE(offset + 26);
    const extraLength = body.readUInt16LE(offset + 28);
    const name = body.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, inflateRawSync(body.subarray(start, start + compressedSize)));
    offset = start + compressedSize;
  }
  return entries;
}
