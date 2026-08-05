import { writeSync } from "node:fs";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { EVIDENCE_REGISTRY } from "./evidence/index.mjs";
import {
  assertSafePackagePath,
  buildMapping,
  createMappingContextProvider,
  writeMappingPackage,
} from "./lib/mapping-engine.mjs";
import { loadPrismaCatalog } from "./lib/prisma-catalog.mjs";
import { buildSourceInventory } from "./lib/source-inventory.mjs";
import {
  ADMIN_BUSINESS_RULES,
  buildRuleRegistry,
  CERTIFICATE_RULES,
  INTEGRACAO_REGULARIZE_RULES,
  PARCELAMENTO_RULES,
  REMAINING_RULES,
  RH_PESSOAL_RULES,
  TECHNOLOGY_RULES,
} from "./rules/index.mjs";

const USAGE = `Uso:
  node docs/migration/v4/scripts/build-mapping.mjs \\
    --source <diretorio-dos-dumps> \\
    --legacy-source <workspace-legado> \\
    --package <diretorio-de-saida> \\
    --prisma <schema.prisma> \\
    --expected-tables <quantidade>
`;

async function main() {
  if (process.argv.slice(2).length === 1 && process.argv[2] === "--help") {
    writeSync(process.stdout.fd, USAGE);
    return;
  }
  const options = parseCommandLine();
  await assertLegacyWorkspace(options.legacySource);
  const protectedPaths = [options.source, options.legacySource, options.prisma];
  try {
    await assertSafePackagePath({ packageDir: options.package, protectedPaths });
  } catch {
    throw new CliError(
      "Package inválido: deve ficar fora das origens e não pode usar symlink/alias.",
    );
  }
  const [inventory, prismaCatalog] = await Promise.all([
    buildSourceInventory({
      sourceDir: options.source,
      expectedTables: options.expectedTables,
    }),
    loadPrismaCatalog(options.prisma),
  ]);
  const ruleRegistry = buildRuleRegistry(
    RH_PESSOAL_RULES,
    TECHNOLOGY_RULES,
    CERTIFICATE_RULES,
    PARCELAMENTO_RULES,
    ADMIN_BUSINESS_RULES,
    INTEGRACAO_REGULARIZE_RULES,
    REMAINING_RULES,
  );
  const contextProvider = createMappingContextProvider({ inventory, ruleRegistry });
  const result = await buildMapping({
    inventory,
    evidenceRegistry: EVIDENCE_REGISTRY,
    ruleRegistry,
    prismaCatalog,
    sourceDir: options.source,
    capabilities: contextProvider,
  });
  await writeMappingPackage(options.package, result, { protectedPaths });
}

function parseCommandLine() {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        source: { type: "string" },
        "legacy-source": { type: "string" },
        package: { type: "string" },
        prisma: { type: "string" },
        "expected-tables": { type: "string" },
      },
      strict: true,
    }));
  } catch {
    throw new CliError("Argumentos inválidos.");
  }
  if (
    !values.source ||
    !values["legacy-source"] ||
    !values.package ||
    !values.prisma ||
    !values["expected-tables"]
  ) {
    throw new CliError("Argumentos obrigatórios ausentes.");
  }
  return {
    source: values.source,
    legacySource: values["legacy-source"],
    package: values.package,
    prisma: values.prisma,
    expectedTables: parsePositiveInteger(values["expected-tables"]),
  };
}

function parsePositiveInteger(value) {
  if (!/^\d+$/.test(value)) throw new CliError("Argumentos inválidos.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliError("Argumentos inválidos.");
  }
  return parsed;
}

async function assertLegacyWorkspace(directory) {
  if (!(await isRealEntry(directory, "directory"))) {
    throw new CliError("Workspace legado inválido: marcadores do sistema legado ausentes.");
  }
  for (const marker of ["composer.json", "login.php", "classes/Painel.php"]) {
    if (!(await isRealEntry(path.join(directory, marker), "file"))) {
      throw new CliError("Workspace legado inválido: marcadores do sistema legado ausentes.");
    }
  }
}

async function isRealEntry(target, expectedKind) {
  try {
    const inspection = await lstat(target);
    return (
      !inspection.isSymbolicLink() &&
      (expectedKind === "directory" ? inspection.isDirectory() : inspection.isFile())
    );
  } catch {
    return false;
  }
}

class CliError extends Error {}

try {
  await main();
} catch (error) {
  const message =
    error instanceof CliError ? error.message : "Falha ao gerar pacote de mapeamento V4.";
  writeSync(process.stderr.fd, `${message}\n`);
  process.exitCode = 1;
}
