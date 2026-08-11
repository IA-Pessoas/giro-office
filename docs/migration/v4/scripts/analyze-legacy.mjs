import { writeSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { scanLegacyUsage } from "./lib/legacy-code-scanner.mjs";
import { loadPrismaCatalog } from "./lib/prisma-catalog.mjs";
import { buildEvidenceCatalog } from "./lib/semantic-evidence.mjs";
import { buildSourceInventory } from "./lib/source-inventory.mjs";
import { writeStableJson } from "./lib/stable-output.mjs";

export async function main(argumentsList = process.argv.slice(2)) {
  const { legacyDir, sourceDir, schemaPath, outputJsonPath, outputMarkdownPath, expectedTables } =
    parseCommandLine(argumentsList);
  const inventory = await buildSourceInventory({ sourceDir, expectedTables });
  const usage = await scanLegacyUsage({
    legacyDir,
    sourceTables: inventory.tables.map(({ sourceTable }) => sourceTable),
  });
  const prismaCatalog = await loadPrismaCatalog(schemaPath);
  const catalog = buildEvidenceCatalog({ inventory, usage, prismaCatalog, overlays: {} });

  await writeStableJson(outputJsonPath, catalog);
  await writeMarkdown(outputMarkdownPath, catalog);
  return catalog;
}

function parseCommandLine(argumentsList) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argumentsList,
      options: {
        "legacy-source": { type: "string" },
        source: { type: "string" },
        prisma: { type: "string" },
        "out-json": { type: "string" },
        "out-md": { type: "string" },
        "expected-tables": { type: "string" },
      },
      strict: true,
    }));
  } catch {
    throw new Error("Argumentos inválidos.");
  }

  if (
    !values["legacy-source"] ||
    !values.source ||
    !values.prisma ||
    !values["out-json"] ||
    !values["out-md"] ||
    !values["expected-tables"]
  ) {
    throw new Error("Argumentos obrigatórios ausentes.");
  }

  return {
    legacyDir: values["legacy-source"],
    sourceDir: values.source,
    schemaPath: values.prisma,
    outputJsonPath: values["out-json"],
    outputMarkdownPath: values["out-md"],
    expectedTables: parsePositiveInteger(values["expected-tables"]),
  };
}

function parsePositiveInteger(value) {
  if (!/^\d+$/.test(value)) {
    throw new Error("Inteiro positivo obrigatório.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Inteiro positivo obrigatório.");
  }
  return parsed;
}

async function writeMarkdown(filePath, catalog) {
  const lines = [
    "# Auditoria semântica do legado",
    "",
    "| Origem | Estado | Operações | Evidência legada | Evidência atual | Motivo |",
    "| --- | --- | --- | --- | --- | --- |",
    ...catalog.decisions.map(
      (decision) =>
        `| ${escapeCell(decision.sourceTable)} | ${decision.finalStatus} | ${escapeCell(decision.operations.join(", ") || "—")} | ${escapeCell(decision.legacyReferences.join(", ") || "—")} | ${escapeCell(decision.currentContractEvidence.join(", ") || "—")} | ${escapeCell(decision.reasonCode)} |`,
    ),
    "",
  ];
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, lines.join("\n"), "utf8");
}

function escapeCell(value) {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function formatError(error) {
  if (
    error instanceof Error &&
    [
      "Argumentos inválidos.",
      "Argumentos obrigatórios ausentes.",
      "Inteiro positivo obrigatório.",
    ].includes(error.message)
  ) {
    return error.message;
  }
  return "Falha ao analisar código legado.";
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await new Promise((resolve) => setImmediate(resolve));
    await main();
  } catch (error) {
    writeSync(process.stderr.fd, `${formatError(error)}\n`);
    process.exitCode = 1;
  }
}
