#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SOURCE_DIR = "/home/bruno-e-andreia/Documentos/06.07.2026";
const DEFAULT_OUTPUT_DIR = "/tmp/giro-office-migration-v2";
const CONFIRMED_DESTINATIONS = "docs/migration/v2/confirmed-table-destinations.csv";
const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const TENANT_SLUG = "castelo-contabilidade";

function parseArgs(argv) {
  const args = {
    sourceDir: DEFAULT_SOURCE_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source-dir") {
      args.sourceDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      args.outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Argumento desconhecido: ${arg}`);
  }

  return args;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

async function readConfirmedDestinations() {
  const csv = await readFile(CONFIRMED_DESTINATIONS, "utf8");
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);

  return lines.map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function findInsertEnd(sql, startIndex) {
  let quoted = false;
  let escaped = false;

  for (let index = startIndex; index < sql.length; index += 1) {
    const char = sql[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\" && quoted) {
      escaped = true;
      continue;
    }

    if (char === "'") {
      quoted = !quoted;
      continue;
    }

    if (char === ";" && !quoted) {
      return index;
    }
  }

  throw new Error("INSERT sem ponto e virgula final.");
}

function splitSqlTuples(valuesSql) {
  const tuples = [];
  let tuple = "";
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < valuesSql.length; index += 1) {
    const char = valuesSql[index];

    if (escaped) {
      tuple += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && quoted) {
      tuple += char;
      escaped = true;
      continue;
    }

    if (char === "'") {
      tuple += char;
      quoted = !quoted;
      continue;
    }

    if (char === "(" && !quoted) {
      if (depth > 0) {
        tuple += char;
      }
      depth += 1;
      continue;
    }

    if (char === ")" && !quoted) {
      depth -= 1;
      if (depth === 0) {
        tuples.push(tuple);
        tuple = "";
        continue;
      }
    }

    if (depth > 0) {
      tuple += char;
    }
  }

  return tuples;
}

function splitSqlValues(tupleSql) {
  const values = [];
  let value = "";
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < tupleSql.length; index += 1) {
    const char = tupleSql[index];

    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && quoted) {
      value += char;
      escaped = true;
      continue;
    }

    if (char === "'") {
      value += char;
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
      continue;
    }

    value += char;
  }

  values.push(value.trim());
  return values;
}

function unescapeSqlString(value) {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\'/g, "'")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\0/g, "\0");
}

function parseSqlValue(rawValue) {
  if (/^null$/i.test(rawValue)) {
    return null;
  }

  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return unescapeSqlString(rawValue.slice(1, -1));
  }

  if (/^-?\d+$/.test(rawValue)) {
    return Number.parseInt(rawValue, 10);
  }

  if (/^-?\d+\.\d+$/.test(rawValue)) {
    return Number.parseFloat(rawValue);
  }

  return rawValue;
}

function parseInsertRows(sql) {
  const insertRegex = /INSERT INTO `([^`]+)` \(([^)]+)\) VALUES\s*/g;
  const rows = [];
  let match;

  while ((match = insertRegex.exec(sql)) !== null) {
    const columns = [...match[2].matchAll(/`([^`]+)`/g)].map((columnMatch) => columnMatch[1]);
    const insertEnd = findInsertEnd(sql, insertRegex.lastIndex);
    const valuesSql = sql.slice(insertRegex.lastIndex, insertEnd);
    const tuples = splitSqlTuples(valuesSql);

    for (const tuple of tuples) {
      const values = splitSqlValues(tuple).map(parseSqlValue);
      if (values.length !== columns.length) {
        throw new Error(`Quantidade de valores nao bate com colunas em ${match[1]}.`);
      }

      rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
    }

    insertRegex.lastIndex = insertEnd + 1;
  }

  return rows;
}

async function rebuildPackage({ sourceDir, outputDir }) {
  const confirmedDestinations = await readConfirmedDestinations();
  const rawOutputDir = path.join(outputDir, "raw-confirmed");
  await mkdir(rawOutputDir, { recursive: true });

  const tableSummaries = [];

  for (const destination of confirmedDestinations) {
    const sourceFile = path.join(sourceDir, `${destination.legacy_table}.sql`);
    const outputFile = path.join(rawOutputDir, `${destination.legacy_table}.json`);
    let rows = [];
    let status = "ok";
    let errorMessage;

    try {
      const sql = await readFile(sourceFile, "utf8");
      rows = parseInsertRows(sql);
      await writeFile(outputFile, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    } catch (error) {
      status = "error";
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    tableSummaries.push({
      legacy_table: destination.legacy_table,
      target_table: destination.target_table,
      row_count: rows.length,
      status,
      source_file: sourceFile,
      output_file: status === "ok" ? outputFile : null,
      error: errorMessage,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    tenant: {
      organization_id: ORGANIZATION_ID,
      slug: TENANT_SLUG,
    },
    source: `backup MariaDB local em ${sourceDir}; sem escrita no Supabase`,
    output: outputDir,
    mode: "raw-confirmed-staging",
    note: "Pacote cru das tabelas com destino confirmado. Nao aplica transformacoes finais e nao escreve no Supabase.",
    tables: tableSummaries,
  };

  const csvLines = [
    "\"legacy_table\",\"target_table\",\"row_count\",\"status\",\"source_file\",\"output_file\",\"error\"",
    ...tableSummaries.map((summary) =>
      [
        summary.legacy_table,
        summary.target_table,
        String(summary.row_count),
        summary.status,
        summary.source_file,
        summary.output_file ?? "",
        summary.error ?? "",
      ]
        .map((cell) => `"${cell.replace(/"/g, "\"\"")}"`)
        .join(","),
    ),
  ];

  await writeFile(path.join(outputDir, "manifest.raw-confirmed.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "confirmed-table-row-counts.csv"), `${csvLines.join("\n")}\n`, "utf8");

  const errors = tableSummaries.filter((summary) => summary.status !== "ok");
  console.log(
    JSON.stringify(
      {
        outputDir,
        tables: tableSummaries.length,
        errors: errors.length,
        totalRows: tableSummaries.reduce((sum, summary) => sum + summary.row_count, 0),
        errorTables: errors.map((summary) => ({
          legacy_table: summary.legacy_table,
          error: summary.error,
        })),
      },
      null,
      2,
    ),
  );

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

await rebuildPackage(parseArgs(process.argv.slice(2)));
