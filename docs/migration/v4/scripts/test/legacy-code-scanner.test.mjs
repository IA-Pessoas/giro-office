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

test("scanLegacyUsage interrompe a leitura de dump SQL antes dos valores de INSERT", async () => {
  await withTemporaryDirectory(async (directory) => {
    const legacyDirectory = path.join(directory, "legacy");
    const sqlPath = path.join(legacyDirectory, "dump.sql");
    const sql = "INSERT INTO tb_admin.usuarios (nome) VALUES ('raw-value-must-not-be-read');";
    const lastHeaderByte = sql.indexOf("VALUES") + "VALUES".length - 1;
    const bytes = Buffer.from(sql, "utf8");
    const positions = [];
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(sqlPath, sql, "utf8");

    const usage = await scanLegacyUsage({
      legacyDir: legacyDirectory,
      sourceTables: ["tb_admin.usuarios"],
      readTextFile: async () => {
        throw new Error("Arquivo SQL não pode ter leitura textual integral.");
      },
      openSqlFile: async () => ({
        close: async () => {},
        read: async (buffer, offset, length, position) => {
          assert.equal(length, 1);
          assert.ok(position <= lastHeaderByte, "Não deve ler bytes de VALUES.");
          positions.push(position);
          buffer[offset] = bytes[position];
          return { buffer, bytesRead: 1 };
        },
      }),
    });

    assert.deepEqual(usage.tables, [
      {
        legacyModule: ".",
        legacyReferences: ["dump.sql:1"],
        legacyRelationships: [],
        operations: ["insert"],
        sourceTable: "tb_admin.usuarios",
      },
    ]);
    assert.equal(Math.max(...positions), lastHeaderByte);
    assert.doesNotMatch(JSON.stringify(usage), /raw-value-must-not-be-read/);
  });
});
