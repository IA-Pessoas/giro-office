import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ALL_EVIDENCE } from "../evidence/index.mjs";

const CLI = path.resolve("docs/migration/v4/scripts/build-mapping.mjs");
const PRISMA = path.resolve("infra/prisma/schema.prisma");

async function withSandbox(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "migration-v4-cli-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: path.resolve("."),
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
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function createCompleteSource(directory) {
  const sourceDir = path.join(directory, "source");
  const legacyDir = path.join(directory, "legacy");
  await mkdir(sourceDir);
  await mkdir(legacyDir);
  for (const evidence of ALL_EVIDENCE) {
    const content =
      evidence.finalStatus === "confirmed"
        ? `INSERT INTO \`${evidence.sourceTable}\` (\`id\`) VALUES (1);\n`
        : "-- origem pending não deve ser executada\n";
    await writeFile(path.join(sourceDir, `${evidence.sourceTable}.sql`), content);
  }
  return { sourceDir, legacyDir };
}

test("CLI aceita somente as cinco origens declaradas e gera pacote dry-run completo", async () => {
  await withSandbox(async (directory) => {
    const { sourceDir, legacyDir } = await createCompleteSource(directory);
    const packageDir = path.join(directory, "package");

    const execution = await runCli([
      "--source",
      sourceDir,
      "--legacy-source",
      legacyDir,
      "--package",
      packageDir,
      "--prisma",
      PRISMA,
      "--expected-tables",
      "312",
    ]);

    assert.equal(execution.code, 0);
    assert.equal(execution.signal, null);
    assert.equal(execution.stderr, "");
    assert.equal(execution.stdout, "");
    const mappings = JSON.parse(await readFile(path.join(packageDir, "mapping/tables.json")));
    const pending = JSON.parse(
      await readFile(path.join(packageDir, "pending-mapping/tables.json")),
    );
    assert.equal(mappings.length + pending.length, 312);
  });
});

test("CLI rejeita flags de escrita e preserva o pacote sem efeitos colaterais", async () => {
  await withSandbox(async (directory) => {
    const packageDir = path.join(directory, "package");
    await mkdir(packageDir);
    await writeFile(path.join(packageDir, "sentinel.txt"), "NAO_ALTERAR\n");

    for (const forbidden of ["--apply", "--write-db", "--delete"]) {
      const execution = await runCli([forbidden]);
      assert.notEqual(execution.code, 0, forbidden);
      assert.equal(execution.stdout, "", forbidden);
      assert.doesNotMatch(execution.stderr, /postgres|database_url|senha|token/i, forbidden);
      assert.equal(
        await readFile(path.join(packageDir, "sentinel.txt"), "utf8"),
        "NAO_ALTERAR\n",
        forbidden,
      );
    }
  });
});
