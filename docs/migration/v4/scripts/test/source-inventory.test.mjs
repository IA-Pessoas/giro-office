import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildSourceInventory } from "../lib/source-inventory.mjs";

const USERS_DUMP = "INSERT INTO `legacy`.`users` (`id`, `senha`) VALUES (1, 'ultrassecreto');\n";
const TEAMS_DUMP = "INSERT INTO `legacy`.`teams` (`id`, `nome`) VALUES (1, 'Equipe A');\n";
const JWT_SHAPED_STEM = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature";

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "giro-v4-inventory-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function writeDump(directory, fileName, content) {
  await writeFile(path.join(directory, fileName), content, "utf8");
}

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

test("buildSourceInventory seleciona somente dumps .sql e ordena tabelas por sourceTable", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeDump(directory, "public.users.sql", USERS_DUMP);
    await writeDump(directory, "public.teams.sql", TEAMS_DUMP);
    await writeDump(directory, "ignore.txt", "nao e um dump");
    await writeDump(directory, "ignore.SQL", "nao e um dump");

    const inventory = await buildSourceInventory({ sourceDir: directory, expectedTables: 2 });

    assert.equal(inventory.actualTableCount, 2);
    assert.deepEqual(
      inventory.tables.map((table) => table.sourceTable),
      ["public.teams", "public.users"],
    );
  });
});

test("buildSourceInventory preserva stems com um, dois ou mais segmentos", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeDump(directory, "tb_historico.sql", USERS_DUMP);
    await writeDump(directory, "public.users.sql", USERS_DUMP);
    await writeDump(directory, "tb_regularize.orientaoes_processual.socios.sql", USERS_DUMP);

    const inventory = await buildSourceInventory({ sourceDir: directory, expectedTables: 3 });

    assert.deepEqual(
      inventory.tables.map((table) => table.sourceTable),
      ["public.users", "tb_historico", "tb_regularize.orientaoes_processual.socios"],
    );
  });
});

test("buildSourceInventory aceita stem literal em formato de JWT", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeDump(directory, `${JWT_SHAPED_STEM}.sql`, USERS_DUMP);

    const inventory = await buildSourceInventory({ sourceDir: directory, expectedTables: 1 });

    assert.equal(inventory.tables[0].sourceTable, JWT_SHAPED_STEM);
  });
});

test("buildSourceInventory rejeita dump com stem vazio", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeDump(directory, ".sql", USERS_DUMP);

    await assert.rejects(
      () => buildSourceInventory({ sourceDir: directory, expectedTables: 1 }),
      /stem vazio/i,
    );
  });
});

test("buildSourceInventory rejeita sourceTable duplicada sem diferenciar caixa", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeDump(directory, "public.Users.sql", USERS_DUMP);
    await writeDump(directory, "PUBLIC.users.sql", USERS_DUMP);

    await assert.rejects(
      () => buildSourceInventory({ sourceDir: directory, expectedTables: 2 }),
      /duplicada/i,
    );
  });
});

test("buildSourceInventory falha quando a contagem real difere da esperada", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeDump(directory, "public.users.sql", USERS_DUMP);

    await assert.rejects(
      () => buildSourceInventory({ sourceDir: directory, expectedTables: 2 }),
      /esperad[ao].*2.*encontrad[ao].*1/i,
    );
  });
});

test("buildSourceInventory calcula sourceDigest ordenado a partir de tabela, hash e linhas", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeDump(directory, "public.users.sql", USERS_DUMP);
    await writeDump(directory, "public.teams.sql", TEAMS_DUMP);

    const inventory = await buildSourceInventory({ sourceDir: directory, expectedTables: 2 });
    const expectedDigest = createHash("sha256")
      .update(
        [`public.teams\t${sha256(TEAMS_DUMP)}\t1`, `public.users\t${sha256(USERS_DUMP)}\t1`].join(
          "\n",
        ),
        "utf8",
      )
      .digest("hex");

    assert.equal(inventory.sourceDigest, expectedDigest);
  });
});

test("buildSourceInventory expõe somente o basename do diretório e nomes de colunas sensíveis", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeDump(directory, "public.users.sql", USERS_DUMP);

    const inventory = await buildSourceInventory({ sourceDir: directory, expectedTables: 1 });

    assert.equal(inventory.sourceDirectoryLabel, path.basename(directory));
    assert.doesNotMatch(inventory.sourceDirectoryLabel, /[\\/]/);
    assert.deepEqual(inventory.tables[0].sensitiveColumns, ["senha"]);
    assert.doesNotMatch(JSON.stringify(inventory), /ultrassecreto/);
  });
});

test("buildSourceInventory rejeita concorrência que não seja inteiro positivo", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeDump(directory, "public.users.sql", USERS_DUMP);

    await assert.rejects(
      () => buildSourceInventory({ sourceDir: directory, expectedTables: 1, concurrency: 0 }),
      /concorr[eê]ncia/i,
    );
  });
});
