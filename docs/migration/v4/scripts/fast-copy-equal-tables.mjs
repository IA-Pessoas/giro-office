#!/usr/bin/env node

import fs from "node:fs/promises";
import { accessSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";

import { iterateSqlRows } from "./lib/sql-dump-parser.mjs";
import { loadPrismaCatalog, getModelByDatabaseName } from "./lib/prisma-catalog.mjs";

const CASTELO_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";

function parseCommandLine() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      source: { type: "string" },
      "source-inventory": {
        type: "string",
        default: "docs/migration/v4/reports/source-inventory.json",
      },
      prisma: { type: "string", default: "infra/prisma/schema.prisma" },
      "batch-size": { type: "string", default: "300" },
      tenant: { type: "string", default: CASTELO_ORGANIZATION_ID },
      "dry-run": { type: "boolean", default: false },
      "allow-subset": { type: "boolean", default: false },
      "on-conflict-ignore": { type: "boolean", default: true },
      "target-tables": { type: "string", default: "" },
      "source-only": { type: "boolean", default: false },
    },
    strict: true,
  });

  if (!values.source) {
    throw new Error("Informe --source com o diretório do backup de SQL.");
  }

  const batchSize = Number.parseInt(values["batch-size"], 10);
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("--batch-size inválido.");
  }

  return {
    sourceDir: values.source,
    sourceInventoryPath: values["source-inventory"],
    prismaPath: values.prisma,
    batchSize,
    tenantId: values.tenant,
    dryRun: values["dry-run"],
    allowSubset: values["allow-subset"],
    onConflictIgnore: values["on-conflict-ignore"],
    targetTables: values["target-tables"]
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    sourceOnly: values["source-only"],
    dbUrl: process.env.MIGRATION_DATABASE_URL,
  };
}

function normalizeColumnName(value) {
  return String(value).toLowerCase();
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function equalColumnSets(leftColumns, rightColumns) {
  if (leftColumns.length !== rightColumns.length) {
    return false;
  }
  return leftColumns.every((column, index) => column === rightColumns[index]);
}

async function listDumpTables(sourceDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name.slice(0, -".sql".length))
    .sort();
}

function buildCandidateList({
  sourceInventory,
  prismaCatalog,
  sourceTables,
  targetTables,
  allowSubset,
}) {
  const inventoryBySource = new Map(
    sourceInventory.tables.map((entry) => [normalizeColumnName(entry.sourceTable), entry]),
  );
  const destinationModelsByName = new Map(
    prismaCatalog.models.map((model) => [normalizeColumnName(model.databaseName), model]),
  );
  const targets = new Set(targetTables);

  const candidates = [];

  for (const sourceTable of sourceTables) {
    const sourceEntry = inventoryBySource.get(normalizeColumnName(sourceTable));
    if (!sourceEntry) {
      continue;
    }
    if (targets.size > 0 && !targets.has(normalizeColumnName(sourceTable))) {
      continue;
    }

    const candidateDestination =
      destinationModelsByName.get(normalizeColumnName(sourceTable)) ??
      destinationModelsByName.get(normalizeColumnName(sourceTable.split(".").at(-1)));

    if (!candidateDestination) {
      continue;
    }

    const sourceColumns = [...new Set(sourceEntry.columns.map(normalizeColumnName))].sort();
    const destinationColumns = candidateDestination.fields
      .filter((field) => !field.list)
      .map((field) => normalizeColumnName(field.databaseName))
      .sort();
    const destinationSet = new Set(destinationColumns);

    const sourceInDestination = sourceColumns.every((column) => destinationSet.has(column));
    if (!sourceInDestination) {
      continue;
    }

    const exactMatch = equalColumnSets(sourceColumns, destinationColumns);
    if (!exactMatch && !allowSubset) {
      continue;
    }

    const missingRequired = candidateDestination.fields
      .filter((field) => !field.list && !field.nullable && field.default === undefined)
      .map((field) => normalizeColumnName(field.databaseName))
      .filter((field) => !sourceColumns.includes(field));

    candidates.push({
      sourceTable,
      destinationTable: candidateDestination.databaseName,
      mode: exactMatch ? "exact" : "subset",
      sourceColumns,
      destinationColumns: candidateDestination.fields
        .filter((field) => !field.list)
        .map((field) => normalizeColumnName(field.databaseName)),
      missingRequired,
      rowCount: sourceEntry.rowCount,
      sourceRowCount: sourceEntry.rowCount,
    });
  }

  candidates.sort((left, right) => left.sourceTable.localeCompare(right.sourceTable));
  return candidates;
}

function buildBatchInsert({
  destinationTable,
  columns,
  values,
  onConflictIgnore,
  startIndex,
}) {
  const quotedTable = quoteIdentifier(destinationTable);
  const quotedColumns = columns.map(quoteIdentifier).join(", ");
  const placeholders = [];
  const params = [];

  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const tuple = [];
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const paramIndex = startIndex + rowIndex * columns.length + columnIndex + 1;
      tuple.push(`$${paramIndex}`);
    }
    placeholders.push(`(${tuple.join(", ")})`);
  }

  const valuesFlattened = values.flat();
  for (const value of valuesFlattened) {
    params.push(value);
  }

  const query = [
    `INSERT INTO ${quotedTable} (${quotedColumns})`,
    `VALUES ${placeholders.join(", ")}`,
    onConflictIgnore ? "ON CONFLICT DO NOTHING" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { query, params };
}

async function copyTableEqual({
  client,
  sourceDir,
  sourceTable,
  destinationTable,
  columns,
  batchSize,
  onConflictIgnore,
  dryRun,
}) {
  const sourceFilePath = path.join(sourceDir, `${sourceTable}.sql`);
  const selectedColumns = columns;

  let totalCandidates = 0;
  let batch = [];
  let placeholderBase = 0;

  for await (const row of iterateSqlRows(sourceFilePath)) {
    const payload = selectedColumns.map((column) => {
      const raw = row[column];
      return raw === "" ? null : raw;
    });
    batch.push(payload);
    totalCandidates += 1;
    if (batch.length >= batchSize) {
      if (!dryRun) {
        const { query, params } = buildBatchInsert({
          destinationTable,
          columns: selectedColumns,
          values: batch,
          onConflictIgnore,
          startIndex: placeholderBase,
        });
        const result = await client.query(query, params);
        if (result.rowCount === null) {
          console.log(`  lote: ${batch.length} linhas processadas (sem rowCount).`);
        }
        placeholderBase += batch.length * selectedColumns.length;
      }
      batch = [];
    }
  }

  if (batch.length > 0 && !dryRun) {
    const { query, params } = buildBatchInsert({
      destinationTable,
      columns: selectedColumns,
      values: batch,
      onConflictIgnore,
      startIndex: placeholderBase,
    });
    await client.query(query, params);
  }

  if (dryRun) {
    console.log(`  prévia: ${totalCandidates} linhas preparadas.`);
  } else {
    console.log(`  processadas: ${totalCandidates} linhas.`);
  }
}

async function main() {
  const {
    sourceDir,
    sourceInventoryPath,
    prismaPath,
    batchSize,
    tenantId,
    dryRun,
    allowSubset,
    onConflictIgnore,
    targetTables,
    sourceOnly,
    dbUrl,
  } = parseCommandLine();

  if (!tenantId) {
    throw new Error("Informe --tenant.");
  }

  if (!dbUrl && !sourceOnly && !dryRun) {
    throw new Error("Defina MIGRATION_DATABASE_URL.");
  }

  const catalog = await loadPrismaCatalog(prismaPath);
  const sourceInventory = JSON.parse(await fs.readFile(sourceInventoryPath, "utf8"));
  const sourceTables = await listDumpTables(sourceDir);

  const candidates = buildCandidateList({
    sourceInventory,
    prismaCatalog: catalog,
    sourceTables,
    targetTables,
    allowSubset,
  });

  if (candidates.length === 0) {
    console.log("Nenhuma tabela em modo direto encontrada com essas regras.");
    return;
  }

  console.log("Tabelas candidatas:");
  for (const candidate of candidates) {
    const label = candidate.mode === "exact" ? "exata" : "subset";
    const required = candidate.missingRequired.length;
    console.log(
      `- ${candidate.sourceTable} -> ${candidate.destinationTable} (${label}) ` +
        `rows=${candidate.rowCount} col=${candidate.sourceColumns.length} / ` +
        `${candidate.destinationColumns.length} faltaObrig=${required}`,
    );
  }

  if (sourceOnly) {
    return;
  }

  if (dryRun) {
    console.log("Modo dry-run: nenhuma escrita no banco.");
    for (const candidate of candidates) {
      if (candidate.missingRequired.length > 0) {
        console.log(
          `  ignorando ${candidate.sourceTable} -> ${candidate.destinationTable}: ` +
            `colunas obrigatórias não encontradas: ${formatColumns(candidate.missingRequired)}.`,
        );
        continue;
      }
      await copyTableEqual({
        sourceDir,
        sourceTable: candidate.sourceTable,
        destinationTable: candidate.destinationTable,
        columns: candidate.sourceColumns,
        batchSize,
        onConflictIgnore,
        dryRun,
      });
    }
    return;
  }

  const { Client } = resolvePgDependency();
  const client = new Client({ connectionString: dbUrl, application_name: "migration-v4-equal-copy" });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const candidate of candidates) {
      if (candidate.missingRequired.length > 0) {
        console.log(
          `  ignorando ${candidate.sourceTable} -> ${candidate.destinationTable}: ` +
            `colunas obrigatórias não encontradas: ${formatColumns(candidate.missingRequired)}.`,
        );
        continue;
      }
      await copyTableEqual({
        client,
        sourceDir,
        sourceTable: candidate.sourceTable,
        destinationTable: candidate.destinationTable,
        columns: candidate.sourceColumns,
        batchSize,
        onConflictIgnore,
        dryRun,
      });
    }
    await client.query("COMMIT");
    console.log("Concluído. Commit realizado.");
  } finally {
    await client.end();
  }
}

function formatColumns(values) {
  return values.join(", ");
}

function resolvePgDependency() {
  const candidateFromPgNodePath = () => {
    const pgNodePath = process.env.PG_NODE_PATH;
    if (!pgNodePath) {
      return null;
    }

    const candidates = [
      path.resolve(pgNodePath),
      path.resolve(pgNodePath, "pg"),
      path.resolve(pgNodePath, "..", "pg"),
      path.resolve(pgNodePath, "..", "..", "pg"),
    ];

    for (const candidate of candidates) {
      const marker = path.join(candidate, "package.json");
      try {
        accessSync(marker);
        const requireFrom = createRequire(path.join(candidate, "package.json"));
        return requireFrom("pg");
      } catch {
        // segue para o próximo candidato
      }
    }

    return null;
  };

  const local = () => createRequire(import.meta.url)("pg");
  try {
    return local();
  } catch (error) {
    const fromPath = candidateFromPgNodePath();
    if (fromPath !== null) {
      return fromPath;
    }

    const start = path.dirname(fileURLToPath(import.meta.url));
    let current = start;
    while (true) {
      const marker = path.join(
        current,
        "node_modules",
        ".pnpm",
        "pg@8.20.0",
        "node_modules",
        "pg",
        "package.json",
      );
      try {
        accessSync(marker);
        const packageRoot = path.join(
          current,
          "node_modules",
          ".pnpm",
          "pg@8.20.0",
          "node_modules",
          "pg",
        );
        const requireFrom = createRequire(path.join(packageRoot, "package.json"));
        return requireFrom("pg");
      } catch {
        const parent = path.dirname(current);
        if (parent === current) {
          throw error;
        }
        current = parent;
      }
    }
  }
}

const { Client } = resolvePgDependency();

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Erro inesperado.");
  process.exitCode = 1;
}
