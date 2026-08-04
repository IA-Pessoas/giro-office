import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(testDirectory, "../analyze-legacy.mjs");
const schemaPath = path.join(testDirectory, "fixtures/schema-catalog.prisma");

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "giro-v4-analyze-legacy-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function runCli(argumentsList) {
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

test("analyze-legacy exige todos os argumentos e rejeita argumento desconhecido", async () => {
  const missing = await runCli([]);
  const unknown = await runCli(["--unknown", "value"]);

  assert.notEqual(missing.code, 0);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /argumentos obrigatórios/i);
  assert.notEqual(unknown.code, 0);
  assert.equal(unknown.stdout, "");
  assert.match(unknown.stderr, /argumentos inválidos/i);
});

test("analyze-legacy gera JSON e Markdown sanitizados", async () => {
  await withTemporaryDirectory(async (directory) => {
    const sourceDirectory = path.join(directory, "source");
    const legacyDirectory = path.join(testDirectory, "fixtures/legacy-mini");
    const outputJson = path.join(directory, "out", "evidence.json");
    const outputMarkdown = path.join(directory, "out", "evidence.md");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(
      path.join(sourceDirectory, "workspace_table.sql"),
      "INSERT INTO workspace_table (id) VALUES ('value-not-to-version');\n",
      "utf8",
    );

    const result = await runCli([
      "--legacy-source",
      legacyDirectory,
      "--source",
      sourceDirectory,
      "--prisma",
      schemaPath,
      "--out-json",
      outputJson,
      "--out-md",
      outputMarkdown,
      "--expected-tables",
      "1",
    ]);

    assert.deepEqual(result, { code: 0, stderr: "", stdout: "" });
    const json = await readFile(outputJson, "utf8");
    const markdown = await readFile(outputMarkdown, "utf8");
    assert.equal(JSON.parse(json).decisions.length, 1);
    assert.match(markdown, /workspace_table/);
    assert.doesNotMatch(json, /value-not-to-version/);
    assert.doesNotMatch(markdown, /value-not-to-version/);
  });
});
