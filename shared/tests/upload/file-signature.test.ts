import assert from "node:assert/strict";
import test from "node:test";

import { ServiceError } from "../../src/http/errors.js";
import { validateUploadFileSignature } from "../../src/upload/file-signature.js";

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
      buffer: Buffer.from("PK\x03\x04document"),
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalname: "doc.docx",
    }),
  );
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
