import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { scanLegacyUsage } from "../lib/legacy-code-scanner.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.join(testDirectory, "fixtures/legacy-mini");

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "giro-v4-legacy-scanner-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test("scanLegacyUsage registra referências sanitizadas e ignora árvores excluídas", async () => {
  const usage = await scanLegacyUsage({
    legacyDir: fixtureDirectory,
    sourceTables: ["tb_admin.usuarios", "tb_admin.permissoes_financeiro", "tb_sem_uso"],
  });

  assert.deepEqual(usage, {
    legacyDirectoryLabel: "legacy-mini",
    tables: [
      {
        legacyModule: "modules/admin",
        legacyReferences: ["modules/admin/usuarios.php:8"],
        legacyRelationships: ["tb_admin.permissoes_{$modulo}"],
        operations: ["dynamic", "select"],
        sourceTable: "tb_admin.permissoes_financeiro",
      },
      {
        legacyModule: "modules/admin",
        legacyReferences: [
          "modules/admin/listas.php:2",
          "modules/admin/usuarios.php:3",
          "modules/admin/usuarios.php:4",
          "modules/admin/usuarios.php:5",
          "modules/admin/usuarios.php:6",
          "modules/admin/usuarios.php:7",
        ],
        legacyRelationships: [],
        operations: ["delete", "insert", "select", "update"],
        sourceTable: "tb_admin.usuarios",
      },
      {
        legacyModule: null,
        legacyReferences: [],
        legacyRelationships: [],
        operations: [],
        sourceTable: "tb_sem_uso",
      },
    ],
  });
});

test("scanLegacyUsage lê cada arquivo elegível uma vez ao indexar várias tabelas", async () => {
  const reads = [];
  await scanLegacyUsage({
    legacyDir: fixtureDirectory,
    sourceTables: ["tb_admin.usuarios", "tb_admin.permissoes_financeiro"],
    readTextFile: async (filePath) => {
      reads.push(path.relative(fixtureDirectory, filePath));
      return await (await import("node:fs/promises")).readFile(filePath, "utf8");
    },
  });

  assert.deepEqual(reads, ["modules/admin/listas.php", "modules/admin/usuarios.php"]);
});

test("scanLegacyUsage preserva a sourceTable canônica quando a referência usa outra capitalização", async () => {
  const usage = await scanLegacyUsage({
    legacyDir: fixtureDirectory,
    sourceTables: ["tb_admin.USUARIOS"],
  });

  assert.equal(usage.tables[0].sourceTable, "tb_admin.USUARIOS");
  assert.deepEqual(usage.tables[0].legacyReferences, [
    "modules/admin/listas.php:2",
    "modules/admin/usuarios.php:3",
    "modules/admin/usuarios.php:4",
    "modules/admin/usuarios.php:5",
    "modules/admin/usuarios.php:6",
    "modules/admin/usuarios.php:7",
  ]);
});

test("scanLegacyUsage reconhece referências estáticas adjacentes", async () => {
  const usage = await scanLegacyUsage({
    legacyDir: fixtureDirectory,
    sourceTables: ["tb_admin.usuarios", "tb_admin.perfis"],
  });

  assert.deepEqual(usage.tables[0].legacyReferences, ["modules/admin/listas.php:2"]);
  assert.deepEqual(usage.tables[1].legacyReferences, [
    "modules/admin/listas.php:2",
    "modules/admin/usuarios.php:3",
    "modules/admin/usuarios.php:4",
    "modules/admin/usuarios.php:5",
    "modules/admin/usuarios.php:6",
    "modules/admin/usuarios.php:7",
  ]);
});

test("scanLegacyUsage preserva multi-statement em script SQL de código sem emitir valores", async () => {
  await withTemporaryDirectory(async (directory) => {
    const legacyDirectory = path.join(directory, "legacy");
    const sqlPath = path.join(legacyDirectory, "dump.sql");
    const sql = [
      "INSERT INTO tb_admin.usuarios (nome) VALUES ('first-raw-value');",
      "INSERT INTO tb_admin.perfis (nome) VALUES ('second-raw-value');",
      "UPDATE tb_admin.usuarios SET ativo = 1;",
    ].join("\n");
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(sqlPath, sql, "utf8");

    const usage = await scanLegacyUsage({
      legacyDir: legacyDirectory,
      sourceTables: ["tb_admin.usuarios", "tb_admin.perfis"],
      readTextFile: async () => sql,
    });

    assert.deepEqual(usage.tables, [
      {
        legacyModule: ".",
        legacyReferences: ["dump.sql:2"],
        legacyRelationships: [],
        operations: ["insert"],
        sourceTable: "tb_admin.perfis",
      },
      {
        legacyModule: ".",
        legacyReferences: ["dump.sql:1", "dump.sql:3"],
        legacyRelationships: [],
        operations: ["insert", "update"],
        sourceTable: "tb_admin.usuarios",
      },
    ]);
    assert.doesNotMatch(JSON.stringify(usage), /first-raw-value|second-raw-value/);
  });
});

test("scanLegacyUsage ignora dump SQL assinado antes de alcançar valores de INSERT", async () => {
  await withTemporaryDirectory(async (directory) => {
    const legacyDirectory = path.join(directory, "legacy");
    const sqlPath = path.join(legacyDirectory, "export.sql");
    const sql = [
      "-- MySQL dump 10.13",
      "INSERT INTO tb_admin.usuarios (nome) VALUES ('dump-raw-value-must-not-be-read');",
    ].join("\n");
    const bytes = Buffer.from(sql, "utf8");
    const lastHeaderByte = sql.indexOf("\n");
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(sqlPath, sql, "utf8");

    const usage = await scanLegacyUsage({
      legacyDir: legacyDirectory,
      sourceTables: ["tb_admin.usuarios"],
      readTextFile: async () => {
        throw new Error("Dump assinado não pode ter leitura textual integral.");
      },
      openSqlFile: async () => ({
        close: async () => {},
        read: async (buffer, offset, length, position) => {
          assert.equal(length, 1);
          assert.ok(position <= lastHeaderByte, "Não deve ler além do cabeçalho do dump.");
          buffer[offset] = bytes[position];
          return { buffer, bytesRead: 1 };
        },
      }),
    });

    assert.deepEqual(usage.tables, [
      {
        legacyModule: null,
        legacyReferences: [],
        legacyRelationships: [],
        operations: [],
        sourceTable: "tb_admin.usuarios",
      },
    ]);
    assert.doesNotMatch(JSON.stringify(usage), /dump-raw-value-must-not-be-read/);
  });
});

for (const { label, signature } of [
  { label: "whitespace inicial", signature: " \t-- MySQL dump 10.13" },
  { label: "BOM UTF-8", signature: "\uFEFF-- PostgreSQL database dump" },
  { label: "BOM UTF-8 e whitespace inicial", signature: "\uFEFF  -- pg_dump" },
]) {
  test(`scanLegacyUsage reconhece dump SQL com ${label} antes dos dados`, async () => {
    await withTemporaryDirectory(async (directory) => {
      const legacyDirectory = path.join(directory, "legacy");
      const sqlPath = path.join(legacyDirectory, "export.sql");
      const sql = [
        signature,
        "INSERT INTO tb_admin.usuarios (nome) VALUES ('dump-raw-value-must-not-be-read');",
      ].join("\n");
      const bytes = Buffer.from(sql, "utf8");
      const lastHeaderByte = bytes.indexOf("\n");
      await mkdir(legacyDirectory, { recursive: true });
      await writeFile(sqlPath, sql, "utf8");

      const usage = await scanLegacyUsage({
        legacyDir: legacyDirectory,
        sourceTables: ["tb_admin.usuarios"],
        readTextFile: async () => {
          throw new Error("Dump assinado não pode ter leitura textual integral.");
        },
        openSqlFile: async () => ({
          close: async () => {},
          read: async (buffer, offset, length, position) => {
            assert.equal(length, 1);
            assert.ok(position <= lastHeaderByte, "Não deve ler além do cabeçalho do dump.");
            buffer[offset] = bytes[position];
            return { buffer, bytesRead: 1 };
          },
        }),
      });

      assert.deepEqual(usage.tables, [
        {
          legacyModule: null,
          legacyReferences: [],
          legacyRelationships: [],
          operations: [],
          sourceTable: "tb_admin.usuarios",
        },
      ]);
      assert.doesNotMatch(JSON.stringify(usage), /dump-raw-value-must-not-be-read/);
    });
  });
}
