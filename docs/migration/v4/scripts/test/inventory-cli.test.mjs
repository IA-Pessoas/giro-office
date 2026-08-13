import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(testDirectory, "../inventory.mjs");
const USERS_DUMP = "INSERT INTO `legacy`.`users` (`id`, `senha`) VALUES (1, 'ultrassecreto');\n";

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "giro-v4-inventory-cli-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function runInventory(argumentsList) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...argumentsList], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
}

test("inventory CLI grava JSON estável sem imprimir dumps", async () => {
  await withTemporaryDirectory(async (directory) => {
    const sourceDirectory = path.join(directory, "backup-legado");
    const firstOutput = path.join(directory, "first", "inventory.json");
    const secondOutput = path.join(directory, "second", "inventory.json");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(path.join(sourceDirectory, "public.users.sql"), USERS_DUMP, "utf8");

    const first = await runInventory([
      "--source",
      sourceDirectory,
      "--out",
      firstOutput,
      "--expected-tables",
      "1",
    ]);
    const second = await runInventory([
      "--source",
      sourceDirectory,
      "--out",
      secondOutput,
      "--expected-tables",
      "1",
      "--concurrency",
      "1",
    ]);

    assert.deepEqual(first, { code: 0, stderr: "", stdout: "" });
    assert.deepEqual(second, { code: 0, stderr: "", stdout: "" });
    assert.deepEqual(await readFile(firstOutput), await readFile(secondOutput));
    assert.deepEqual(JSON.parse(await readFile(firstOutput, "utf8")), {
      actualTableCount: 1,
      expectedTableCount: 1,
      sourceDigest: createHash("sha256")
        .update(
          `public.users\t${createHash("sha256").update(USERS_DUMP, "utf8").digest("hex")}\t1`,
          "utf8",
        )
        .digest("hex"),
      sourceDirectoryLabel: "backup-legado",
      tables: [
        {
          columns: ["id", "senha"],
          fileName: "public.users.sql",
          fileSizeBytes: Buffer.byteLength(USERS_DUMP),
          insertStatementCount: 1,
          legacyIdColumn: "id",
          relativePath: "public.users.sql",
          rowCount: 1,
          sensitiveColumns: ["senha"],
          sha256: createHash("sha256").update(USERS_DUMP, "utf8").digest("hex"),
          sourceTable: "public.users",
        },
      ],
    });
  });
});

test("inventory CLI falha sem escrever saída quando a contagem está incorreta", async () => {
  await withTemporaryDirectory(async (directory) => {
    const sourceDirectory = path.join(directory, "backup-legado");
    const output = path.join(directory, "inventory.json");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(path.join(sourceDirectory, "public.users.sql"), USERS_DUMP, "utf8");

    const result = await runInventory([
      "--source",
      sourceDirectory,
      "--out",
      output,
      "--expected-tables",
      "2",
    ]);

    assert.notEqual(result.code, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /esperad[ao].*2.*encontrad[ao].*1/i);
    await assert.rejects(() => readFile(output));
  });
});
