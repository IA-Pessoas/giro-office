import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildRuleRegistry,
  createPendingMapping,
  PENDING_REASON_CODES,
  REQUIRED_IDENTITY_NAMESPACE,
  validateMappingRule,
} from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(fixtureDirectory, "fixtures", "schema-catalog.prisma");

function mappedColumn(overrides = {}) {
  return {
    sourceColumn: "nome",
    destinationColumn: "workspace_name",
    status: "mapped",
    transformation: "trim",
    nullHandling: "quarantine_if_empty",
    referenceRole: "none",
    sensitivity: "none",
    reason: "Nome legado preservado no destino.",
    ...overrides,
  };
}

function validRule(overrides = {}) {
  return {
    sourceTable: "tb_legacy.workspaces",
    destinationTable: "workspace_table",
    status: "confirmed",
    domain: "workspace",
    ruleOrigin: "docs/migration/v2/confirmed-table-destinations.csv",
    reason: "Destino confirmado na migração V2 e revalidado no Prisma atual.",
    identity: {
      legacyColumn: "id",
      scope: "tb_legacy.workspaces",
      namespace: REQUIRED_IDENTITY_NAMESPACE,
    },
    dependencies: [],
    columns: [mappedColumn()],
    classifyRow: () => ({ status: "prepared" }),
    ...overrides,
  };
}

test("validateMappingRule aceita o contrato confirmado completo", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.equal(validateMappingRule(validRule(), catalog), true);
});

test("validateMappingRule rejeita regra que não esteja confirmed", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () => validateMappingRule(validRule({ status: "pending" }), catalog),
    /status.*confirmed/i,
  );
});

test("validateMappingRule rejeita destino ou coluna ausente no catálogo Prisma", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () => validateMappingRule(validRule({ destinationTable: "missing_table" }), catalog),
    /tabela de destino inexistente/i,
  );
  assert.throws(
    () =>
      validateMappingRule(
        validRule({ columns: [mappedColumn({ destinationColumn: "missing_column" })] }),
        catalog,
      ),
    /coluna de destino inexistente/i,
  );
});

test("validateMappingRule exige coluna legada, escopo e namespace de identidade congelado", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  for (const identity of [
    { legacyColumn: "", scope: "tb_legacy.workspaces", namespace: REQUIRED_IDENTITY_NAMESPACE },
    { legacyColumn: "id", scope: "", namespace: REQUIRED_IDENTITY_NAMESPACE },
    { legacyColumn: "id", scope: "tb_legacy.workspaces", namespace: randomUUID() },
  ]) {
    assert.throws(
      () => validateMappingRule(validRule({ identity }), catalog),
      /identidade|namespace/i,
    );
  }
});

test("validateMappingRule exige ColumnRule completo e reason para coluna não preservada", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () =>
      validateMappingRule(
        validRule({
          columns: [mappedColumn({ destinationColumn: null, status: "mapped" })],
        }),
        catalog,
      ),
    /destinationColumn/i,
  );
  assert.throws(
    () =>
      validateMappingRule(
        validRule({
          columns: [
            mappedColumn({
              destinationColumn: null,
              status: "not_preserved",
              reason: "",
            }),
          ],
        }),
        catalog,
      ),
    /reason/i,
  );
});

test("validateMappingRule impede transformação em claro para credential e secret", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  for (const [sensitivity, transformation] of [
    ["credential", "plain"],
    ["credential", "copy"],
    ["secret", "preserve_raw"],
  ]) {
    assert.throws(
      () =>
        validateMappingRule(
          validRule({ columns: [mappedColumn({ sensitivity, transformation })] }),
          catalog,
        ),
      /transformação.*sensível|credential|secret/i,
    );
  }
});

test("buildRuleRegistry rejeita colisão de sourceTable sem diferenciar caixa", () => {
  assert.throws(
    () => buildRuleRegistry([[validRule()], [validRule({ sourceTable: "TB_LEGACY.WORKSPACES" })]]),
    /sourceTable.*duplicada|colisão/i,
  );
});

test("buildRuleRegistry registra somente regras confirmed por sourceTable", () => {
  const second = validRule({ sourceTable: "tb_legacy.members" });
  const registry = buildRuleRegistry([[validRule()], [second]]);

  assert.equal(registry.size, 2);
  assert.equal(registry.get("tb_legacy.workspaces")?.status, "confirmed");
  assert.equal(registry.get("tb_legacy.members"), second);
  assert.throws(
    () => buildRuleRegistry([[validRule({ status: "pending" })]]),
    /status.*confirmed/i,
  );
});

test("createPendingMapping preserva tabela sem regra sem sugerir tabela ou serviço", () => {
  const pending = createPendingMapping(
    { sourceTable: "tb_legacy.unmapped", rowCount: 27 },
    PENDING_REASON_CODES.NO_CONFIRMED_DESTINATION,
    ["A tabela não aparece no registro de destinos confirmados."],
  );

  assert.deepEqual(pending, {
    sourceTable: "tb_legacy.unmapped",
    sourceRowCount: 27,
    destinationTable: null,
    status: "pending",
    reasonCode: "NO_CONFIRMED_DESTINATION",
    reason: "A tabela não aparece no registro de destinos confirmados.",
    domain: "unclassified",
    ruleOrigin: "docs/migration/v4/scripts/lib/mapping-contract.mjs",
    identityStrategy: null,
    dependencies: [],
    preparedRowCount: 0,
    quarantineRowCount: 0,
    evidence: ["A tabela não aparece no registro de destinos confirmados."],
  });
  assert.equal("suggestedDestinationTable" in pending, false);
  assert.equal("suggestedService" in pending, false);
});

test("createPendingMapping aceita somente reason code conhecido e evidência objetiva não vazia", () => {
  const inspection = { sourceTable: "tb_legacy.unmapped", rowCount: 0 };

  assert.throws(() => createPendingMapping(inspection, "UNKNOWN", ["Ausente."]), /reasonCode/i);
  assert.throws(
    () => createPendingMapping(inspection, PENDING_REASON_CODES.BUSINESS_DECISION_REQUIRED, []),
    /evidence/i,
  );
});
