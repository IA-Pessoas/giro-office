import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { scanLegacyUsage } from "../lib/legacy-code-scanner.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.join(testDirectory, "fixtures/legacy-mini");

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
