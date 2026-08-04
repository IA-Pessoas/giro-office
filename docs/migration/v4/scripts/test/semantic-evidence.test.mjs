import assert from "node:assert/strict";
import test from "node:test";

import { buildEvidenceCatalog, validateEvidenceCoverage } from "../lib/semantic-evidence.mjs";

const inventory = {
  actualTableCount: 4,
  expectedTableCount: 4,
  tables: [
    { sourceTable: "legacy.direct" },
    { sourceTable: "legacy.adapted" },
    { sourceTable: "legacy.no_current" },
    { sourceTable: "legacy.no_code" },
  ],
};

const usage = {
  tables: [
    {
      sourceTable: "legacy.direct",
      legacyModule: "admin",
      legacyReferences: ["admin/direct.php:4"],
      operations: ["select"],
      legacyRelationships: [],
    },
    {
      sourceTable: "legacy.adapted",
      legacyModule: "financeiro",
      legacyReferences: ["financeiro/adapted.php:8"],
      operations: ["insert"],
      legacyRelationships: [],
    },
    {
      sourceTable: "legacy.no_current",
      legacyModule: "arquivo",
      legacyReferences: ["arquivo/no-current.php:2"],
      operations: ["select"],
      legacyRelationships: [],
    },
    {
      sourceTable: "legacy.no_code",
      legacyModule: null,
      legacyReferences: [],
      operations: [],
      legacyRelationships: [],
    },
  ],
};

const prismaCatalog = {
  models: [
    { databaseName: "legacy.direct" },
    { databaseName: "current.adapted" },
    { databaseName: "legacy.no_code" },
  ],
};

test("buildEvidenceCatalog classifica destino direto, adaptação, ausência de contrato e ausência de código", () => {
  const catalog = buildEvidenceCatalog({
    inventory,
    usage,
    prismaCatalog,
    overlays: {
      "legacy.adapted": {
        currentContractEvidence: ["Prisma: current.adapted"],
        destinationTable: "current.adapted",
      },
    },
  });

  assert.deepEqual(catalog.decisions, [
    {
      confidence: "medium",
      currentContractEvidence: ["Prisma: legacy.direct"],
      finalStatus: "pending",
      legacyModule: "admin",
      legacyReferences: ["admin/direct.php:4"],
      legacyRelationships: [],
      operations: ["select"],
      reason: "Destino direto localizado; revisão semântica ainda é obrigatória.",
      reasonCode: "DIRECT_DESTINATION_REQUIRES_REVIEW",
      ruleId: null,
      sourceTable: "legacy.direct",
    },
    {
      confidence: "medium",
      currentContractEvidence: ["Prisma: current.adapted"],
      finalStatus: "pending",
      legacyModule: "financeiro",
      legacyReferences: ["financeiro/adapted.php:8"],
      legacyRelationships: [],
      operations: ["insert"],
      reason: "Adaptação para contrato atual localizada; revisão semântica ainda é obrigatória.",
      reasonCode: "ADAPTATION_REQUIRES_REVIEW",
      ruleId: null,
      sourceTable: "legacy.adapted",
    },
    {
      confidence: "low",
      currentContractEvidence: [],
      finalStatus: "pending",
      legacyModule: "arquivo",
      legacyReferences: ["arquivo/no-current.php:2"],
      legacyRelationships: [],
      operations: ["select"],
      reason: "Nenhum contrato atual candidato foi localizado.",
      reasonCode: "NO_CURRENT_CONTRACT",
      ruleId: null,
      sourceTable: "legacy.no_current",
    },
    {
      confidence: "low",
      currentContractEvidence: ["Prisma: legacy.no_code"],
      finalStatus: "pending",
      legacyModule: "sem referência",
      legacyReferences: [],
      legacyRelationships: [],
      operations: [],
      reason: "Nenhuma referência de código legado foi localizada.",
      reasonCode: "NO_LEGACY_CODE_REFERENCE",
      ruleId: null,
      sourceTable: "legacy.no_code",
    },
  ]);
  assert.doesNotThrow(() => validateEvidenceCoverage(catalog, inventory));
});

test("validateEvidenceCoverage rejeita confirmed sem evidência atual ou ruleId", () => {
  assert.throws(
    () =>
      validateEvidenceCoverage(
        {
          decisions: [
            {
              sourceTable: "legacy.direct",
              legacyModule: "admin",
              legacyReferences: ["admin/direct.php:4"],
              operations: ["select"],
              legacyRelationships: [],
              currentContractEvidence: [],
              finalStatus: "confirmed",
              reasonCode: "CONFIRMED",
              reason: "Inválido.",
              confidence: "high",
              ruleId: null,
            },
          ],
        },
        { tables: [{ sourceTable: "legacy.direct" }] },
      ),
    /confirmed/i,
  );
});
