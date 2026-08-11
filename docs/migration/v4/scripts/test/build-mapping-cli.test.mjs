import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  await mkdir(path.join(legacyDir, "classes"), { recursive: true });
  await writeFile(path.join(legacyDir, "composer.json"), '{"name":"fixture/legacy"}\n');
  await writeFile(path.join(legacyDir, "login.php"), "<?php // marcador legado\n");
  await writeFile(path.join(legacyDir, "classes", "Painel.php"), "<?php class Painel {}\n");
  for (const evidence of ALL_EVIDENCE) {
    const content =
      evidence.finalStatus === "confirmed"
        ? `INSERT INTO \`${evidence.sourceTable}\` (\`id\`) VALUES (1);\n`
        : "-- origem pending não deve ser executada\n";
    await writeFile(path.join(sourceDir, `${evidence.sourceTable}.sql`), content);
  }
  return { sourceDir, legacyDir };
}

function validArguments({ sourceDir, legacyDir, packageDir }) {
  return [
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
  ];
}

test("CLI aceita somente as cinco origens declaradas e gera pacote dry-run completo", async () => {
  await withSandbox(async (directory) => {
    const { sourceDir, legacyDir } = await createCompleteSource(directory);
    const packageDir = path.join(directory, "package");

    const execution = await runCli(validArguments({ sourceDir, legacyDir, packageDir }));

    assert.equal(execution.code, 0, execution.stderr);
    assert.equal(execution.signal, null);
    assert.equal(execution.stderr, "");
    assert.equal(execution.stdout, "");
    const mappings = JSON.parse(await readFile(path.join(packageDir, "mapping/tables.json")));
    const pending = JSON.parse(
      await readFile(path.join(packageDir, "pending-mapping/tables.json")),
    );
    const preflight = JSON.parse(await readFile(path.join(packageDir, "preflight/summary.json")));
    const quarantine = JSON.parse(await readFile(path.join(packageDir, "quarantine/summary.json")));
    assert.equal(mappings.length + pending.length, 312);
    assert.equal(
      mappings.every(({ preflightComplete }) => preflightComplete === false),
      true,
    );
    assert.equal(
      mappings.every(({ prepared }) => prepared === 0),
      true,
    );
    assert.equal(
      mappings.every(
        ({ blockedRows, quarantine: quarantined }) => blockedRows > 0 && quarantined === 0,
      ),
      true,
    );
    assert.equal(preflight.blockedSources, 103);
    assert.equal(preflight.blockedSteps, 133);
    assert.equal(preflight.totalBlockedRows, 133);
    assert.equal(quarantine.total, 0);
  });
});

test("CLI rejeita flags de escrita e preserva o pacote sem efeitos colaterais", async () => {
  await withSandbox(async (directory) => {
    const { sourceDir, legacyDir } = await createCompleteSource(directory);
    const packageDir = path.join(directory, "package");
    await mkdir(packageDir);
    await writeFile(path.join(packageDir, "sentinel.txt"), "NAO_ALTERAR\n");

    for (const forbidden of ["--apply", "--write-db", "--delete"]) {
      const execution = await runCli([
        ...validArguments({ sourceDir, legacyDir, packageDir }),
        forbidden,
      ]);
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

test("CLI oferece help e diferencia argumentos, workspace legado e package inseguro", async () => {
  await withSandbox(async (directory) => {
    const help = await runCli(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /--source.*--legacy-source.*--package/s);
    assert.equal(help.stderr, "");

    const missing = await runCli([]);
    assert.notEqual(missing.code, 0);
    assert.match(missing.stderr, /obrigatórios/i);

    const unknown = await runCli(["--unknown"]);
    assert.notEqual(unknown.code, 0);
    assert.match(unknown.stderr, /inválidos/i);

    const { sourceDir, legacyDir } = await createCompleteSource(directory);
    const invalidLegacy = path.join(directory, "not-legacy");
    await mkdir(invalidLegacy);
    const invalidWorkspace = await runCli(
      validArguments({
        sourceDir,
        legacyDir: invalidLegacy,
        packageDir: path.join(directory, "package-invalid-legacy"),
      }),
    );
    assert.notEqual(invalidWorkspace.code, 0);
    assert.match(invalidWorkspace.stderr, /marcadores.*legado/i);

    const unsafePackage = await runCli(
      validArguments({ sourceDir, legacyDir, packageDir: sourceDir }),
    );
    assert.notEqual(unsafePackage.code, 0);
    assert.match(unsafePackage.stderr, /package.*origens/i);

    const sourceAlias = path.join(directory, "source-alias");
    await symlink(sourceDir, sourceAlias);
    const aliasPackage = await runCli(
      validArguments({ sourceDir, legacyDir, packageDir: sourceAlias }),
    );
    assert.notEqual(aliasPackage.code, 0);
    assert.match(aliasPackage.stderr, /symlink|alias|origens/i);
  });
});
