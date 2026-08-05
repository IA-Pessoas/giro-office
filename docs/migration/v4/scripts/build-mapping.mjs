import { stat } from "node:fs/promises";
import { parseArgs } from "node:util";

import { EVIDENCE_REGISTRY } from "./evidence/index.mjs";
import { buildMapping, writeMappingPackage } from "./lib/mapping-engine.mjs";
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

async function main() {
  const options = parseCommandLine();
  await assertDirectory(options.legacySource);
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
  const result = await buildMapping({
    inventory,
    evidenceRegistry: EVIDENCE_REGISTRY,
    ruleRegistry,
    prismaCatalog,
    sourceDir: options.source,
    capabilities: {
      encryption: false,
      credentialEncryptionVerified: false,
      certificateStorageEncryptionVerified: false,
    },
  });
  await writeMappingPackage(options.package, result);
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
    throw new Error("Argumentos inválidos");
  }
  if (
    !values.source ||
    !values["legacy-source"] ||
    !values.package ||
    !values.prisma ||
    !values["expected-tables"]
  ) {
    throw new Error("Argumentos obrigatórios ausentes");
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
  if (!/^\d+$/.test(value)) throw new Error("Inteiro positivo obrigatório");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Inteiro positivo obrigatório");
  }
  return parsed;
}

async function assertDirectory(directory) {
  let inspection;
  try {
    inspection = await stat(directory);
  } catch {
    throw new Error("Diretório legado inválido");
  }
  if (!inspection.isDirectory()) throw new Error("Diretório legado inválido");
}

try {
  await main();
} catch {
  await new Promise((resolve) => {
    process.stderr.write("Falha ao gerar pacote de mapeamento V4.\n", resolve);
  });
  process.exitCode = 1;
}
