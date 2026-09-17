import assert from "node:assert/strict";
import test from "node:test";

import { ServiceError } from "../../src/http/errors.js";
import { validateUploadFileSignature } from "../../src/upload/file-signature.js";

function createStoredZip(entries: readonly string[]): Buffer {
  const localEntries: Buffer[] = [];
  const centralEntries: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localEntries.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralEntries.push(central);
    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localEntries, centralDirectory, end]);
}

test("validateUploadFileSignature rejects spoofed PDF content", () => {
  assert.throws(
    () =>
      validateUploadFileSignature({
        buffer: Buffer.from("<script>alert(1)</script>"),
        mimetype: "application/pdf",
        originalname: "payload.pdf",
      }),
    (error) => error instanceof ServiceError && error.statusCode === 400,
  );
});

test("validateUploadFileSignature accepts supported binary signatures", () => {
  assert.doesNotThrow(() =>
    validateUploadFileSignature({
      buffer: Buffer.from("%PDF-1.7\n"),
      mimetype: "application/pdf",
      originalname: "doc.pdf",
    }),
  );

  assert.doesNotThrow(() =>
    validateUploadFileSignature({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      mimetype: "image/jpeg",
      originalname: "photo.jpg",
    }),
  );

  assert.doesNotThrow(() =>
    validateUploadFileSignature({
      buffer: createStoredZip(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]),
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalname: "doc.docx",
    }),
  );

  assert.doesNotThrow(() =>
    validateUploadFileSignature({
      buffer: createStoredZip(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml"]),
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      originalname: "planilha.xlsx",
    }),
  );
});

test("validateUploadFileSignature rejects generic ZIP content declared as OOXML", () => {
  for (const mimetype of [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]) {
    assert.throws(
      () =>
        validateUploadFileSignature({
          buffer: Buffer.from("PK\x03\x04generic zip"),
          mimetype,
          originalname: "arquivo.zip",
        }),
      (error) => error instanceof ServiceError && error.statusCode === 400,
    );
  }
});

test("validateUploadFileSignature rejects text and csv files containing NUL bytes", () => {
  assert.throws(
    () =>
      validateUploadFileSignature({
        buffer: Buffer.from("name,value\0evil"),
        mimetype: "text/csv",
        originalname: "data.csv",
      }),
    (error) => error instanceof ServiceError && error.statusCode === 400,
  );
});
