import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { inspectSqlDump, iterateSqlRows } from "../lib/sql-dump-parser.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixturesDirectory = path.join(testDirectory, "fixtures");

async function collectRows(filePath) {
  const rows = [];
  for await (const row of iterateSqlRows(filePath)) {
    rows.push(row);
  }
  return rows;
}

test("iterateSqlRows preserva valores como string ou null em multiplos INSERT", async () => {
  const rows = await collectRows(path.join(fixturesDirectory, "parser-basic.sql"));

  assert.deepEqual(rows, [
    {
      id: "9007199254740993",
      nome: "Ana",
      observacao: "primeira; observacao",
      saldo: "10.50",
      apagado: null,
    },
    {
      id: "2",
      nome: "Bia",
      observacao: "segunda observacao",
      saldo: "0",
      apagado: null,
    },
    {
      id: "3",
      nome: "Céu",
      observacao: "NULL",
      saldo: "123",
      apagado: null,
    },
  ]);
});

test("iterateSqlRows decodifica escapes, UTF-8, quebras de linha e ponto e virgula em strings", async () => {
  const rows = await collectRows(path.join(fixturesDirectory, "parser-escaped.sql"));

  assert.deepEqual(rows, [
    {
      id: "1",
      texto: "O'Reilly; primeira linha\nsegunda linha",
      caminho: "C:\\temp\\arquivo",
      observacao: "café 😀",
    },
  ]);
});

test("inspectSqlDump acumula metadados, colunas e contagens sem expor valores", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "giro-v4-parser-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dumpPath = path.join(directory, "tb_schema.tabela.sql");
  await cp(path.join(fixturesDirectory, "parser-basic.sql"), dumpPath);

  const inspection = await inspectSqlDump(dumpPath, { relativeTo: directory });

  assert.deepEqual(inspection.columns, ["id", "nome", "observacao", "saldo", "apagado"]);
  assert.equal(inspection.sourceTable, "tb_schema.tabela");
  assert.equal(inspection.fileName, "tb_schema.tabela.sql");
  assert.equal(inspection.relativePath, "tb_schema.tabela.sql");
  assert.equal(inspection.rowCount, 3);
  assert.equal(inspection.insertStatementCount, 2);
  assert.equal(inspection.legacyIdColumn, "id");
  assert.match(inspection.sha256, /^[a-f0-9]{64}$/);
  assert.ok(inspection.fileSizeBytes > 0);
  assert.deepEqual(inspection.sensitiveColumns, []);
});

test("iterateSqlRows informa arquivo e posicao sem vazar a linha malformada", async () => {
  const filePath = path.join(fixturesDirectory, "parser-malformed.sql");

  await assert.rejects(
    async () => collectRows(filePath),
    (error) => {
      assert.match(error.message, /parser-malformed\.sql/);
      assert.match(error.message, /posi[çc][aã]o \d+/i);
      assert.doesNotMatch(error.message, /conteudo-ultrassecreto-sem-fechamento/);
      return true;
    },
  );
});

test("iterateSqlRows ignora INSERT INTOX sem gerar linhas ou metadados de INSERT", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "giro-v4-parser-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dumpPath = path.join(directory, "tb_schema.invalida.sql");
  await writeFile(
    dumpPath,
    "INSERT INTOX `tb_schema`.`invalida` (`id`, `nome`) VALUES (1, 'nao deve entrar');\n",
  );

  assert.deepEqual(await collectRows(dumpPath), []);
  const inspection = await inspectSqlDump(dumpPath, { relativeTo: directory });
  assert.deepEqual(inspection.columns, []);
  assert.equal(inspection.rowCount, 0);
  assert.equal(inspection.insertStatementCount, 0);
  assert.equal(inspection.legacyIdColumn, null);
  assert.deepEqual(inspection.sensitiveColumns, []);
});

test("o modulo do parser usa streaming e nao readFile", async () => {
  const modulePath = path.join(testDirectory, "../lib/sql-dump-parser.mjs");
  const source = await readFile(modulePath, "utf8");

  assert.match(source, /createReadStream/);
  assert.doesNotMatch(source, /\breadFile\b/);
});
