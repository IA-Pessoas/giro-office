import { parseArgs } from "node:util";
import { buildSourceInventory } from "./lib/source-inventory.mjs";
import { writeStableJson } from "./lib/stable-output.mjs";

async function main() {
  const { sourceDir, outputPath, expectedTables, concurrency } = parseCommandLine();
  const inventory = await buildSourceInventory({
    sourceDir,
    expectedTables,
    concurrency,
  });
  await writeStableJson(outputPath, inventory);
}

function parseCommandLine() {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        source: { type: "string" },
        out: { type: "string" },
        "expected-tables": { type: "string" },
        concurrency: { type: "string" },
      },
      strict: true,
    }));
  } catch {
    throw new Error("Argumentos inválidos.");
  }

  if (!values.source || !values.out || !values["expected-tables"]) {
    throw new Error("Argumentos obrigatórios ausentes.");
  }

  return {
    sourceDir: values.source,
    outputPath: values.out,
    expectedTables: parsePositiveInteger(values["expected-tables"]),
    concurrency:
      values.concurrency === undefined ? undefined : parsePositiveInteger(values.concurrency),
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

function formatError(error) {
  if (
    error instanceof Error &&
    /^Quantidade de tabelas esperada \d+, encontrada \d+\.$/.test(error.message)
  ) {
    return error.message;
  }
  return "Falha ao gerar inventário.";
}

try {
  await main();
} catch (error) {
  await new Promise((resolve) => {
    process.stderr.write(`${formatError(error)}\n`, resolve);
  });
  process.exitCode = 1;
}
