import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildRuleRegistry,
  createPendingMapping,
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

function createIdentity(overrides = {}) {
  return {
    strategy: "create",
    legacyColumn: "id",
    scope: "tb_legacy.workspaces",
    namespace: REQUIRED_IDENTITY_NAMESPACE,
    ...overrides,
  };
}

function destinationStep(overrides = {}) {
  return {
    stepId: "workspace-insert",
    destinationTable: "workspace_table",
    mode: "insert",
    identity: createIdentity(),
    dependencies: [],
    columns: [mappedColumn()],
    ...overrides,
  };
}

function validRule(overrides = {}) {
  return {
    sourceTable: "tb_legacy.workspaces",
    status: "confirmed",
    domain: "workspace",
    ruleOrigin: "draft: mechanical V2 port; revalidate in Task 3",
    reason: "Portada mecanicamente; a decisão semântica será revalidada na Task 3.",
    evidence: {
      legacy: ["Referência histórica V2; revisão semântica pendente."],
      current: ["workspace_table existe no catálogo Prisma atual."],
    },
    cardinality: "1:1",
    destinations: [destinationStep()],
    emitRows: () => [{ stepId: "workspace-insert", status: "prepared" }],
    ...overrides,
  };
}

function pendingEvidence(overrides = {}) {
  return {
    sourceTable: "tb_legacy.unmapped",
    legacyModule: "sem referência",
    legacyReferences: [],
    operations: [],
    legacyRelationships: [],
    currentContractEvidence: [],
    finalStatus: "pending",
    reasonCode: "NO_CURRENT_CONTRACT",
    reason: "Nenhum contrato atual candidato foi localizado.",
    confidence: "low",
    ruleId: null,
    ...overrides,
  };
}

test("validateMappingRule aceita regra 1:1 com passo insert", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.equal(validateMappingRule(validRule(), catalog), true);
});

test("validateMappingRule aceita regra N:1 com passo merge que resolve origem", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const rule = validRule({
    sourceTable: "tb_legacy.workspace_members",
    cardinality: "N:1",
    destinations: [
      destinationStep({
        stepId: "workspace-merge",
        mode: "merge",
        identity: {
          strategy: "resolve",
          source: {
            sourceTable: "tb_legacy.workspaces",
            stepId: "workspace-insert",
          },
        },
      }),
    ],
    emitRows: () => [{ stepId: "workspace-merge", status: "prepared" }],
  });

  assert.equal(validateMappingRule(rule, catalog), true);
});

test("emitRows permite duas emissões 1:N e isola uma quarentena da emissão independente", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const rule = validRule({
    cardinality: "1:N",
    destinations: [
      destinationStep({ stepId: "workspace-insert" }),
      destinationStep({
        stepId: "member-insert",
        destinationTable: "members_table",
        columns: [mappedColumn({ destinationColumn: "workspace_id" })],
      }),
    ],
    emitRows: () => [
      { stepId: "workspace-insert", status: "quarantine", field: "nome", reasonCode: "EMPTY" },
      { stepId: "member-insert", status: "prepared" },
    ],
  });

  assert.equal(validateMappingRule(rule, catalog), true);
  const emissions = rule.emitRows({ nome: "valor-que-não-pode-vazar" });
  assert.deepEqual(emissions, [
    { stepId: "workspace-insert", status: "quarantine", field: "nome", reasonCode: "EMPTY" },
    { stepId: "member-insert", status: "prepared" },
  ]);
  assert.equal(
    emissions.some(({ status }) => status === "prepared"),
    true,
  );
  assert.doesNotMatch(JSON.stringify(emissions), /valor-que-não-pode-vazar|payload/i);
});

test("validateMappingRule aceita aggregate de filho em JSON do pai", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const rule = validRule({
    sourceTable: "tb_legacy.workspace_members",
    cardinality: "N:1",
    destinations: [
      destinationStep({
        stepId: "workspace-members-aggregate",
        mode: "aggregate",
        identity: {
          strategy: "resolve",
          source: {
            sourceTable: "tb_legacy.workspaces",
            stepId: "workspace-insert",
          },
        },
        columns: [mappedColumn({ sourceColumn: "member", destinationColumn: "workspace_note" })],
      }),
    ],
    emitRows: () => [{ stepId: "workspace-members-aggregate", status: "prepared" }],
  });

  assert.equal(validateMappingRule(rule, catalog), true);
});

test("validateMappingRule rejeita stepId duplicado", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () =>
      validateMappingRule(
        validRule({ destinations: [destinationStep(), destinationStep()] }),
        catalog,
      ),
    /stepId.*duplicado/i,
  );
});

test("validateMappingRule rejeita destino ou coluna ausente no catálogo Prisma", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () =>
      validateMappingRule(
        validRule({ destinations: [destinationStep({ destinationTable: "missing_table" })] }),
        catalog,
      ),
    /tabela de destino inexistente/i,
  );
  assert.throws(
    () =>
      validateMappingRule(
        validRule({
          destinations: [
            destinationStep({ columns: [mappedColumn({ destinationColumn: "missing_column" })] }),
          ],
        }),
        catalog,
      ),
    /coluna de destino inexistente/i,
  );
});

test("validateMappingRule exige evidence, origem de resolve e onMany quarantine em lookup", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(() => validateMappingRule(validRule({ evidence: {} }), catalog), /evidence/i);
  assert.throws(
    () =>
      validateMappingRule(
        validRule({
          destinations: [destinationStep({ identity: { strategy: "resolve" } })],
        }),
        catalog,
      ),
    /resolve.*origem|origem.*resolve/i,
  );
  assert.throws(
    () =>
      validateMappingRule(
        validRule({ destinations: [destinationStep({ mode: "lookup", onMany: "first" })] }),
        catalog,
      ),
    /lookup.*onMany.*quarantine/i,
  );
});

test("validateMappingRule impede transformação plain, copy ou preserve_raw em credential", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  for (const transformation of ["plain", "copy", "preserve_raw"]) {
    assert.throws(
      () =>
        validateMappingRule(
          validRule({
            destinations: [
              destinationStep({
                columns: [mappedColumn({ sensitivity: "credential", transformation })],
              }),
            ],
          }),
          catalog,
        ),
      /transformação.*sensível|credential/i,
    );
  }
});

test("validateMappingRule rejeita emitRows que vaza payload ou não referencia um passo conhecido", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () =>
      validateMappingRule(
        validRule({
          emitRows: () => [
            { stepId: "workspace-insert", status: "prepared", payload: "não permitido" },
          ],
        }),
        catalog,
      ),
    /EmissionDecision|payload/i,
  );
  assert.throws(
    () =>
      validateMappingRule(
        validRule({ emitRows: () => [{ stepId: "outro-passo", status: "prepared" }] }),
        catalog,
      ),
    /stepId.*desconhecido/i,
  );
});

test("buildRuleRegistry rejeita colisão de sourceTable sem diferenciar caixa", () => {
  assert.throws(
    () => buildRuleRegistry([[validRule()], [validRule({ sourceTable: "TB_LEGACY.WORKSPACES" })]]),
    /sourceTable.*duplicada|colisão/i,
  );
});

test("createPendingMapping nasce de EvidenceDecision pending sem sugerir destino", () => {
  const evidence = pendingEvidence();
  const pending = createPendingMapping(
    { sourceTable: evidence.sourceTable, rowCount: 27 },
    evidence,
  );

  assert.equal(pending.sourceTable, evidence.sourceTable);
  assert.equal(pending.sourceRowCount, 27);
  assert.equal(pending.status, "pending");
  assert.equal(pending.reasonCode, evidence.reasonCode);
  assert.equal(pending.reason, evidence.reason);
  assert.deepEqual(pending.evidence, evidence);
  assert.equal("destinationTable" in pending, false);
  assert.equal("destinations" in pending, false);
  assert.equal("suggestedDestinationTable" in pending, false);
  assert.equal("suggestedService" in pending, false);
});

test("createPendingMapping rejeita decisão não pending ou de outra origem", () => {
  const inspection = { sourceTable: "tb_legacy.unmapped", rowCount: 0 };

  assert.throws(
    () => createPendingMapping(inspection, pendingEvidence({ finalStatus: "confirmed" })),
    /pending/i,
  );
  assert.throws(
    () => createPendingMapping(inspection, pendingEvidence({ sourceTable: "tb_legacy.other" })),
    /sourceTable/i,
  );
  assert.throws(
    () => createPendingMapping(inspection, pendingEvidence({ operations: "select" })),
    /operations/i,
  );
});

test("validateMappingRule mantém o namespace de identidade congelado para create", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () =>
      validateMappingRule(
        validRule({
          destinations: [
            destinationStep({ identity: createIdentity({ namespace: randomUUID() }) }),
          ],
        }),
        catalog,
      ),
    /namespace/i,
  );
});
