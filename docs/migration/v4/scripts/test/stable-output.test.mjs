import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { stableSortObject, writeCsv, writeStableJson } from "../lib/stable-output.mjs";

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "migration-v4-output-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test("stableSortObject ordena chaves recursivamente sem reordenar listas", () => {
  const sorted = stableSortObject({ z: { b: 2, a: 1 }, a: [{ z: 3, a: 4 }] });

  assert.deepEqual(sorted, { a: [{ a: 4, z: 3 }], z: { a: 1, b: 2 } });
});

test("writeStableJson grava JSON ordenado com newline final", async () => {
  await withTemporaryDirectory(async (directory) => {
    const filePath = path.join(directory, "reports", "mapping.json");

    await writeStableJson(filePath, { z: { beta: 2, alpha: 1 }, a: true });

    assert.equal(
      await readFile(filePath, "utf8"),
      '{\n  "a": true,\n  "z": {\n    "alpha": 1,\n    "beta": 2\n  }\n}\n',
    );
  });
});

test("writeStableJson produz bytes identicos para objetos equivalentes", async () => {
  await withTemporaryDirectory(async (directory) => {
    const firstPath = path.join(directory, "first.json");
    const secondPath = path.join(directory, "second.json");

    await writeStableJson(firstPath, { b: 2, a: { y: 2, x: 1 } });
    await writeStableJson(secondPath, { a: { x: 1, y: 2 }, b: 2 });

    assert.deepEqual(await readFile(firstPath), await readFile(secondPath));
  });
});

test("writeCsv preserva a ordem declarada, escapa RFC 4180 e representa null como vazio", async () => {
  await withTemporaryDirectory(async (directory) => {
    const filePath = path.join(directory, "reports", "mapping.csv");

    await writeCsv(
      filePath,
      ["id", "descricao", "observacao", "ausente"],
      [
        {
          descricao: 'valor, com "aspas"',
          id: 7,
          observacao: "primeira\nsegunda",
          ausente: null,
        },
      ],
    );

    assert.equal(
      await readFile(filePath, "utf8"),
      'id,descricao,observacao,ausente\r\n7,"valor, com ""aspas""","primeira\nsegunda",\r\n',
    );
  });
});

test("writeCsv produz bytes identicos para linhas equivalentes", async () => {
  await withTemporaryDirectory(async (directory) => {
    const firstPath = path.join(directory, "first.csv");
    const secondPath = path.join(directory, "second.csv");
    const columns = ["id", "status"];

    await writeCsv(firstPath, columns, [{ status: "ativo", id: "42" }]);
    await writeCsv(secondPath, columns, [{ id: "42", status: "ativo" }]);

    assert.deepEqual(await readFile(firstPath), await readFile(secondPath));
  });
});
