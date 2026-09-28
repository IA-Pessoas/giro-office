import assert from "node:assert/strict";
import test from "node:test";

import { createZip } from "../src/reporting/zip.js";
import { readZipEntries } from "../src/testUtils/zip.js";

test("zip guarda cada arquivo com nome UTF-8 e conteúdo íntegro", () => {
  const pdf = Buffer.from("%PDF-1.3 conteúdo binário \u0000\u00ff");
  const zip = createZip([
    { fileName: "alíquota-ISS-anexo-III.pdf", body: pdf },
    { fileName: "relatório.csv", body: Buffer.from("a;b\r\n") },
  ]);

  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), 2);
  const entries = readZipEntries(zip);
  assert.deepEqual([...entries.keys()], ["alíquota-ISS-anexo-III.pdf", "relatório.csv"]);
  assert.deepEqual(entries.get("alíquota-ISS-anexo-III.pdf"), pdf);
  assert.equal(entries.get("relatório.csv")?.toString("utf8"), "a;b\r\n");
});

test("zip vazio é um ZIP válido sem entradas", () => {
  const zip = createZip([]);
  assert.equal(zip.length, 22);
  assert.equal(readZipEntries(zip).size, 0);
});
