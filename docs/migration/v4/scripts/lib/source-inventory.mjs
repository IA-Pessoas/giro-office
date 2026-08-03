import crypto from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { assertNoSensitiveValues } from "./sensitivity.mjs";
import { inspectSqlDump, parseSourceTableFileName } from "./sql-dump-parser.mjs";

const DEFAULT_CONCURRENCY = 4;

export async function buildSourceInventory({
  sourceDir,
  expectedTables,
  concurrency = DEFAULT_CONCURRENCY,
}) {
  validateExpectedTableCount(expectedTables);
  validateConcurrency(concurrency);

  const files = await listDumpFiles(sourceDir);
  const sourceTables = files.map(parseSourceTableFileName);
  assertUniqueSourceTables(sourceTables);

  const tables = await inspectDumps({ concurrency, files, sourceDir, sourceTables });
  tables.sort((left, right) => compareText(left.sourceTable, right.sourceTable));

  if (tables.length !== expectedTables) {
    throw new Error(
      `Quantidade de tabelas esperada ${expectedTables}, encontrada ${tables.length}.`,
    );
  }

  const inventory = {
    sourceDirectoryLabel: path.basename(path.resolve(sourceDir)),
    expectedTableCount: expectedTables,
    actualTableCount: tables.length,
    sourceDigest: createSourceDigest(tables),
    tables,
  };
  assertNoSensitiveValues(inventory);
  return inventory;
}

async function listDumpFiles(sourceDir) {
  let entries;
  try {
    entries = await readdir(sourceDir, { withFileTypes: true });
  } catch {
    throw new Error("Diretório de origem inválido.");
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort(compareText);
}

function assertUniqueSourceTables(sourceTables) {
  const seen = new Set();
  for (const sourceTable of sourceTables) {
    const normalized = sourceTable.toLowerCase();
    if (seen.has(normalized)) {
      throw new Error("Tabela de origem duplicada.");
    }
    seen.add(normalized);
  }
}

async function inspectDumps({ files, sourceDir, sourceTables, concurrency }) {
  const tables = new Array(files.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      const inspection = await inspectSqlDump(path.join(sourceDir, files[index]), {
        relativeTo: sourceDir,
      });
      tables[index] = { ...inspection, sourceTable: sourceTables[index] };
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return tables;
}

function createSourceDigest(tables) {
  const canonicalContent = tables
    .map((table) => `${table.sourceTable}\t${table.sha256}\t${table.rowCount}`)
    .join("\n");
  return crypto.createHash("sha256").update(canonicalContent, "utf8").digest("hex");
}

function validateExpectedTableCount(expectedTables) {
  if (!Number.isSafeInteger(expectedTables) || expectedTables < 0) {
    throw new Error("Quantidade esperada de tabelas inválida.");
  }
}

function validateConcurrency(concurrency) {
  if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
    throw new Error("Concorrência deve ser um inteiro positivo.");
  }
}

function compareText(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
