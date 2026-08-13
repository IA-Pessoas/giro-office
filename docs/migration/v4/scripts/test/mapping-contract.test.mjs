import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildRuleRegistry,
  CASTELO_ORGANIZATION_ID,
  createPendingMapping,
  REQUIRED_IDENTITY_NAMESPACE,
  validateMappingRule,
  validateMappingRuleStructure,
  validateStepExecutionContract,
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

function generateIdentity(overrides = {}) {
  return {
    kind: "generate",
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
    identity: generateIdentity(),
    columns: [mappedColumn()],
    constants: {},
    defaults: {},
    precedence: ["source"],
    dependencies: [],
    ...overrides,
  };
}

function preparedEmission(overrides = {}) {
  return {
    stepId: "workspace-insert",
    destinationTable: "workspace_table",
    status: "prepared",
    identityRef: "tb_legacy.workspaces:unknown",
    field: null,
    reasonCode: null,
    ...overrides,
  };
}

function executionContractFor(...stepIds) {
  return typedExecutionContractFor(...stepIds);
}

function typedCondition(stepId, outcome) {
  return {
    stepId,
    outcome,
    conditionId: `${stepId}:${outcome}`,
    predicate: {
      kind: "decision_outcome_equals",
      source: "emit_rows",
      value: outcome,
    },
  };
}

function typedExecutionContractFor(...stepIds) {
  return {
    contextMode: "context_free",
    steps: Object.fromEntries(
      stepIds.map((stepId) => [
        stepId,
        {
          contextRequirements: [],
          decisionSource: "emit_rows",
          preparedWhen: typedCondition(stepId, "prepared"),
          quarantineWhen: typedCondition(stepId, "quarantine"),
          notEmittedWhen: typedCondition(stepId, "not_emitted"),
        },
      ]),
    ),
  };
}

function validRule(overrides = {}) {
  return {
    sourceTable: "tb_legacy.workspaces",
    status: "confirmed",
    domain: "workspace",
    ruleOrigin: "draft: mechanical V2 port; revalidate in Task 3",
    evidence: {
      legacy: ["Referência histórica V2; revisão semântica pendente."],
      current: ["workspace_table existe no catálogo Prisma atual."],
    },
    cardinality: "1:1",
    dependencies: [],
    destinations: [destinationStep()],
    classifySourceRow: () => ({ status: "prepared" }),
    emitRows: () => [preparedEmission()],
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

test("validateMappingRule aceita regra 1:1 com DestinationStep insert congelado", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.equal(validateMappingRule(validRule(), catalog), true);
});

test("validateMappingRuleStructure valida contrato sem executar ou substituir callbacks", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  let calls = 0;
  const classifySourceRow = () => {
    calls += 1;
    throw new Error("callback não deve executar");
  };
  const emitRows = () => {
    calls += 1;
    throw new Error("callback não deve executar");
  };
  const rule = validRule({ classifySourceRow, emitRows });

  assert.equal(validateMappingRuleStructure(rule, catalog), true);
  assert.equal(calls, 0);
  assert.equal(rule.classifySourceRow, classifySourceRow);
  assert.equal(rule.emitRows, emitRows);
});

test("ExecutionContract exige contrato declarativo exato e estruturado para cada stepId", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const contract = executionContractFor("workspace-insert");

  assert.equal(
    validateMappingRuleStructure(validRule({ executionContract: contract }), catalog),
    true,
  );
  assert.throws(
    () =>
      validateMappingRuleStructure(
        validRule({ executionContract: executionContractFor() }),
        catalog,
      ),
    /executioncontract.*(?:ausente|cobertura).*workspace-insert/i,
  );
  assert.throws(
    () =>
      validateMappingRuleStructure(
        validRule({ executionContract: executionContractFor("workspace-insert", "extra") }),
        catalog,
      ),
    /executioncontract.*(?:extra|desconhecido)/i,
  );

  const freeForm = structuredClone(contract);
  freeForm.steps["workspace-insert"].preparedWhen = "source row satisfies mapping";
  assert.throws(
    () => validateMappingRuleStructure(validRule({ executionContract: freeForm }), catalog),
    /preparedWhen.*objeto/i,
  );
});

test("ExecutionContract aceita predicados tipados vinculados a stepId e outcome", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const memberStep = destinationStep({
    stepId: "member-insert",
    destinationTable: "members_table",
    columns: [mappedColumn({ destinationColumn: "workspace_id" })],
  });
  const rule = validRule({
    cardinality: "1:N",
    destinations: [destinationStep(), memberStep],
    executionContract: typedExecutionContractFor("workspace-insert", "member-insert"),
  });

  assert.equal(validateMappingRuleStructure(rule, catalog), true);
  assert.deepEqual(rule.executionContract.steps["workspace-insert"].preparedWhen.predicate, {
    kind: "decision_outcome_equals",
    source: "emit_rows",
    value: "prepared",
  });
});

test("ExecutionContract rejeita condição copiada entre steps ou outcomes", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const memberStep = destinationStep({
    stepId: "member-insert",
    destinationTable: "members_table",
    columns: [mappedColumn({ destinationColumn: "workspace_id" })],
  });
  const destinations = [destinationStep(), memberStep];

  const copiedStep = typedExecutionContractFor("workspace-insert", "member-insert");
  copiedStep.steps["member-insert"].preparedWhen = structuredClone(
    copiedStep.steps["workspace-insert"].preparedWhen,
  );
  assert.throws(
    () =>
      validateMappingRuleStructure(
        validRule({ cardinality: "1:N", destinations, executionContract: copiedStep }),
        catalog,
      ),
    /preparedWhen.*stepId.*member-insert/i,
  );

  const copiedOutcome = typedExecutionContractFor("workspace-insert");
  copiedOutcome.steps["workspace-insert"].quarantineWhen = structuredClone(
    copiedOutcome.steps["workspace-insert"].preparedWhen,
  );
  assert.throws(
    () => validateMappingRuleStructure(validRule({ executionContract: copiedOutcome }), catalog),
    /quarantineWhen.*outcome.*quarantine/i,
  );
});

test("ExecutionContract exige conditionId único e predicate completo não ambíguo", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const memberStep = destinationStep({
    stepId: "member-insert",
    destinationTable: "members_table",
    columns: [mappedColumn({ destinationColumn: "workspace_id" })],
  });
  const destinations = [destinationStep(), memberStep];
  const duplicate = typedExecutionContractFor("workspace-insert", "member-insert");
  duplicate.steps["member-insert"].preparedWhen.conditionId =
    duplicate.steps["workspace-insert"].preparedWhen.conditionId;
  assert.throws(
    () =>
      validateMappingRuleStructure(
        validRule({ cardinality: "1:N", destinations, executionContract: duplicate }),
        catalog,
      ),
    /conditionId.*duplicado/i,
  );

  const ambiguous = typedExecutionContractFor("workspace-insert");
  delete ambiguous.steps["workspace-insert"].notEmittedWhen.predicate.value;
  assert.throws(
    () => validateMappingRuleStructure(validRule({ executionContract: ambiguous }), catalog),
    /predicate.*value/i,
  );
});

test("merge N:1 prioriza vínculo legado explícito antes de lookup natural", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const step = destinationStep({
    stepId: "workspace-merge",
    mode: "merge",
    identity: {
      kind: "resolve",
      sourceTable: "tb_legacy.workspaces",
      sourceColumn: "workspace_id",
      targetLegacyColumn: "id",
    },
    precedence: ["explicit_legacy_link", "natural_lookup"],
  });
  const rule = validRule({
    sourceTable: "tb_legacy.workspace_members",
    cardinality: "N:1",
    destinations: [step],
    emitRows: () => [
      preparedEmission({
        stepId: step.stepId,
        identityRef: "tb_legacy.workspaces:42",
      }),
    ],
  });

  assert.equal(validateMappingRule(rule, catalog), true);
  assert.equal(
    step.precedence.indexOf("explicit_legacy_link") < step.precedence.indexOf("natural_lookup"),
    true,
  );
  assert.throws(
    () =>
      validateMappingRule(
        validRule({
          sourceTable: "tb_legacy.workspace_members",
          cardinality: "N:1",
          destinations: [
            destinationStep({ ...step, precedence: ["natural_lookup", "explicit_legacy_link"] }),
          ],
          emitRows: () => [preparedEmission({ stepId: step.stepId })],
        }),
        catalog,
      ),
    /merge.*explicit_legacy_link.*natural_lookup/i,
  );
});

test("emitRows permite duas emissões 1:N e isola quarentena da emissão independente", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const memberStep = destinationStep({
    stepId: "member-insert",
    destinationTable: "members_table",
    columns: [mappedColumn({ destinationColumn: "workspace_id" })],
  });
  const rule = validRule({
    cardinality: "1:N",
    destinations: [destinationStep(), memberStep],
    emitRows: () => [
      {
        stepId: "workspace-insert",
        destinationTable: "workspace_table",
        status: "quarantine",
        identityRef: "tb_legacy.workspaces:42",
        field: "nome",
        reasonCode: "EMPTY",
      },
      preparedEmission({
        stepId: "member-insert",
        destinationTable: "members_table",
        identityRef: "tb_legacy.workspaces:42",
      }),
    ],
  });

  assert.equal(validateMappingRule(rule, catalog), true);
  assert.equal(
    rule.emitRows({ nome: "valor-que-não-pode-vazar" }).some(({ status }) => status === "prepared"),
    true,
  );
  assert.doesNotMatch(JSON.stringify(rule.emitRows({})), /valor-que-não-pode-vazar|payload/i);
});

test("aggregate N:1 agrega coluna do filho no JSON do pai definido pela identidade", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const step = destinationStep({
    stepId: "workspace-members-aggregate",
    mode: "aggregate",
    identity: {
      kind: "aggregate",
      parentSourceTable: "tb_legacy.workspaces",
      parentLegacyColumn: "id",
      childForeignKey: "workspace_id",
    },
    columns: [
      mappedColumn({
        sourceColumn: "member",
        destinationColumn: "workspace_note",
        transformation: "aggregate_child_json",
      }),
    ],
  });
  const rule = validRule({
    sourceTable: "tb_legacy.workspace_members",
    cardinality: "N:1",
    destinations: [step],
    emitRows: () => [
      preparedEmission({
        stepId: step.stepId,
        identityRef: "tb_legacy.workspaces:42",
      }),
    ],
  });

  assert.equal(validateMappingRule(rule, catalog), true);
  assert.deepEqual(step.identity, {
    kind: "aggregate",
    parentSourceTable: "tb_legacy.workspaces",
    parentLegacyColumn: "id",
    childForeignKey: "workspace_id",
  });
  assert.equal(step.columns[0].transformation, "aggregate_child_json");
});

test("lookup exige IdentitySpec lookup, critérios e onMany quarantine", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const lookupIdentity = {
    kind: "lookup",
    criteria: [{ sourceColumn: "workspace_name", destinationColumn: "workspace_name" }],
    onZero: "quarantine",
    onMany: "quarantine",
  };
  const rule = validRule({
    destinations: [destinationStep({ mode: "lookup", identity: lookupIdentity })],
  });

  assert.equal(validateMappingRule(rule, catalog), true);
  assert.throws(
    () =>
      validateMappingRule(
        validRule({
          destinations: [
            destinationStep({ mode: "lookup", identity: { ...lookupIdentity, onMany: "first" } }),
          ],
        }),
        catalog,
      ),
    /lookup.*onMany.*quarantine/i,
  );
  assert.throws(
    () =>
      validateMappingRule(
        validRule({
          destinations: [
            destinationStep({
              mode: "lookup",
              identity: {
                ...lookupIdentity,
                criteria: [{ sourceColumn: "workspace_name", destinationColumn: "missing_column" }],
              },
            }),
          ],
        }),
        catalog,
      ),
    /coluna de destino inexistente/i,
  );
});

test("validateMappingRule rejeita stepId duplicado, destino/coluna ausentes e evidence vazia", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () =>
      validateMappingRule(
        validRule({ destinations: [destinationStep(), destinationStep()] }),
        catalog,
      ),
    /stepId.*duplicado/i,
  );
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
  assert.throws(() => validateMappingRule(validRule({ evidence: {} }), catalog), /evidence/i);
});

test("validateMappingRule rejeita resolve sem origem e credential em claro", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () =>
      validateMappingRule(
        validRule({ destinations: [destinationStep({ identity: { kind: "resolve" } })] }),
        catalog,
      ),
    /resolve.*sourceTable|sourceTable.*resolve/i,
  );
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

test("a fronteira de emitRows rejeita vazamento condicional em toda invocação", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const rule = validRule({
    emitRows(row) {
      if (row?.legacyValue) {
        return [{ ...preparedEmission(), payload: row.legacyValue }];
      }
      return [preparedEmission()];
    },
  });

  assert.equal(validateMappingRule(rule, catalog), true);
  assert.throws(() => rule.emitRows({ legacyValue: "segredo" }), /não sanitizado|payload/i);
});

test("a fronteira de emitRows exige EmissionDecision congelada por destino e status", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () =>
      validateMappingRule(
        validRule({ emitRows: () => [{ ...preparedEmission(), stepId: "outro-passo" }] }),
        catalog,
      ),
    /stepId.*desconhecido/i,
  );
  assert.throws(
    () =>
      validateMappingRule(
        validRule({ emitRows: () => [{ ...preparedEmission(), status: "unknown" }] }),
        catalog,
      ),
    /Status.*EmissionDecision/i,
  );
});

test("buildRuleRegistry rejeita colisão de sourceTable sem diferenciar caixa", () => {
  assert.throws(
    () => buildRuleRegistry([[validRule()], [validRule({ sourceTable: "TB_LEGACY.WORKSPACES" })]]),
    /sourceTable.*duplicada|colisão/i,
  );
});

test("createPendingMapping nasce de EvidenceDecision pending por allowlist sem destino", () => {
  const evidence = pendingEvidence({
    suggestedDestinationTable: "workspace_table",
    extra: "não copiar",
    nested: { secret: "não copiar" },
  });
  const pending = createPendingMapping(
    { sourceTable: evidence.sourceTable, rowCount: 27, suggestedService: "não copiar" },
    evidence,
  );

  assert.deepEqual(pending, {
    sourceTable: evidence.sourceTable,
    sourceRowCount: 27,
    status: "pending",
    reasonCode: evidence.reasonCode,
    reason: evidence.reason,
    evidence: {
      sourceTable: evidence.sourceTable,
      legacyModule: evidence.legacyModule,
      legacyReferences: [],
      operations: [],
      legacyRelationships: [],
      currentContractEvidence: [],
      finalStatus: "pending",
      reasonCode: evidence.reasonCode,
      reason: evidence.reason,
      confidence: "low",
      ruleId: null,
    },
  });
  assert.doesNotMatch(JSON.stringify(pending), /suggested|não copiar|secret/i);
});

test("createPendingMapping rejeita decisão não pending, de outra origem ou incompleta", () => {
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

test("validateMappingRule mantém namespace congelado e rejeita campos raiz legados", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () =>
      validateMappingRule(
        validRule({
          destinations: [
            destinationStep({ identity: generateIdentity({ namespace: randomUUID() }) }),
          ],
        }),
        catalog,
      ),
    /namespace/i,
  );
  assert.throws(
    () => validateMappingRule(validRule({ destinationTable: "workspace_table" }), catalog),
    /MappingRule.*incompatível/i,
  );
});

function executableCatalog() {
  return {
    models: [
      {
        prismaName: "ExecutionRecord",
        databaseName: "execution_records",
        fields: [
          {
            prismaName: "id",
            databaseName: "id",
            prismaType: "String",
            nullable: false,
            id: true,
            unique: false,
          },
          {
            prismaName: "organizationId",
            databaseName: "organization_id",
            prismaType: "String",
            nullable: false,
            id: false,
            unique: false,
          },
          {
            prismaName: "legacyNote",
            databaseName: "legacy_note",
            prismaType: "String",
            nullable: true,
            id: false,
            unique: false,
          },
          {
            prismaName: "active",
            databaseName: "active",
            prismaType: "Boolean",
            nullable: false,
            id: false,
            unique: false,
          },
        ],
      },
    ],
  };
}

function executableStep(mode = "insert", overrides = {}) {
  const identities = {
    aggregate: {
      kind: "aggregate",
      parentSourceTable: "tb_admin.usuarios",
      parentLegacyColumn: "id",
      childForeignKey: "usuario_id",
    },
    derived: generateIdentity(),
    insert: generateIdentity(),
    lookup: {
      kind: "lookup",
      criteria: [{ sourceColumn: "id", destinationColumn: "id" }],
      onZero: "quarantine",
      onMany: "quarantine",
    },
    merge: {
      kind: "resolve",
      sourceTable: "tb_admin.usuarios",
      sourceColumn: "id",
      targetLegacyColumn: "legacy_id",
    },
  };
  return {
    ...destinationStep({
      destinationTable: "execution_records",
      mode,
      identity: identities[mode],
    }),
    ...overrides,
  };
}

function executableContract(overrides = {}) {
  return {
    contextRequirements: ["source:tb_admin.usuarios.id"],
    tenantScope: {
      kind: "organization_column",
      column: "organization_id",
      organizationId: CASTELO_ORGANIZATION_ID,
    },
    projection: { kind: "column_transformers" },
    write: { kind: "insert", conflictColumns: ["id"] },
    cleanup: {
      kind: "delete_by_identity",
      identityColumns: ["id"],
      ownedColumns: [],
      resetValues: {},
    },
    ...overrides,
  };
}

test("validateStepExecutionContract exige o schema serializável fechado", () => {
  const contract = executableContract();

  assert.equal(
    validateStepExecutionContract(contract, executableStep(), executableCatalog()),
    true,
  );
  assert.throws(
    () =>
      validateStepExecutionContract(
        { ...contract, tenantScope: undefined },
        executableStep(),
        executableCatalog(),
      ),
    /tenantScope/,
  );
  assert.throws(
    () =>
      validateStepExecutionContract(
        { ...contract, sql: "DELETE FROM execution_records" },
        executableStep(),
        executableCatalog(),
      ),
    /campo incompatível.*sql/i,
  );
  assert.throws(
    () =>
      validateStepExecutionContract(
        { ...contract, projection: { kind: "column_transformers", projector: () => ({}) } },
        executableStep(),
        executableCatalog(),
      ),
    /projection.*projector/i,
  );
});

test("validateStepExecutionContract vincula escrita e limpeza ao modo do passo", () => {
  const cases = [
    ["insert", { kind: "insert", conflictColumns: ["id"] }, "delete_by_identity"],
    ["derived", { kind: "insert", conflictColumns: ["id"] }, "delete_by_identity"],
    ["lookup", { kind: "none" }, "none"],
    ["merge", { kind: "update_exactly_one" }, "reset_owned_columns"],
    ["aggregate", { kind: "replace_owned_aggregate" }, "replace_owned_aggregate"],
  ];

  for (const [mode, write, cleanupKind] of cases) {
    const cleanup =
      cleanupKind === "none"
        ? { kind: "none" }
        : {
            kind: cleanupKind,
            identityColumns: ["id"],
            ownedColumns: cleanupKind === "delete_by_identity" ? [] : ["legacy_note"],
            resetValues: cleanupKind === "delete_by_identity" ? {} : { legacy_note: null },
          };
    assert.equal(
      validateStepExecutionContract(
        executableContract({ write, cleanup }),
        executableStep(mode),
        executableCatalog(),
      ),
      true,
    );
  }

  assert.throws(
    () =>
      validateStepExecutionContract(
        executableContract({ cleanup: { kind: "none" } }),
        executableStep("insert"),
        executableCatalog(),
      ),
    /insert.*delete_by_identity/i,
  );
  assert.throws(
    () =>
      validateStepExecutionContract(
        executableContract(),
        executableStep("lookup"),
        executableCatalog(),
      ),
    /lookup.*write.*none/i,
  );
  assert.throws(
    () =>
      validateStepExecutionContract(
        executableContract(),
        executableStep("insert", {
          identity: {
            kind: "resolve",
            sourceTable: "tb_admin.usuarios",
            sourceColumn: "id",
            targetLegacyColumn: "legacy_id",
          },
        }),
        executableCatalog(),
      ),
    /identidade determinística/i,
  );
});

test("validateStepExecutionContract exige namespace e chave física determinísticos", () => {
  assert.throws(
    () =>
      validateStepExecutionContract(
        executableContract(),
        executableStep("insert", {
          identity: {
            kind: "generate",
            legacyColumn: "id",
            scope: "tb_admin.usuarios",
          },
        }),
        executableCatalog(),
      ),
    /namespace/i,
  );

  for (const identityColumn of ["organization_id", "legacy_note"]) {
    assert.throws(
      () =>
        validateStepExecutionContract(
          executableContract({
            write: { kind: "insert", conflictColumns: [identityColumn] },
            cleanup: {
              kind: "delete_by_identity",
              identityColumns: [identityColumn],
              ownedColumns: [],
              resetValues: {},
            },
          }),
          executableStep(),
          executableCatalog(),
        ),
      /identidade.*determinística|chave.*única/i,
    );
  }
});

test("validateStepExecutionContract limita propriedade e reset às colunas Prisma", async () => {
  const mergeStep = executableStep("merge");
  const validCleanup = {
    kind: "reset_owned_columns",
    identityColumns: ["id"],
    ownedColumns: ["legacy_note"],
    resetValues: { legacy_note: null },
  };

  assert.equal(
    validateStepExecutionContract(
      executableContract({ write: { kind: "update_exactly_one" }, cleanup: validCleanup }),
      mergeStep,
      executableCatalog(),
    ),
    true,
  );

  for (const [cleanup, expected] of [
    [{ ...validCleanup, ownedColumns: [] }, /ownedColumns.*não vazio/i],
    [
      {
        ...validCleanup,
        ownedColumns: ["organization_id"],
        resetValues: { organization_id: CASTELO_ORGANIZATION_ID },
      },
      /organization_id/,
    ],
    [
      {
        ...validCleanup,
        ownedColumns: ["missing_column"],
        resetValues: { missing_column: null },
      },
      /coluna.*inexistente/i,
    ],
    [
      {
        ...validCleanup,
        ownedColumns: ["legacy_note", "active"],
        resetValues: { legacy_note: null },
      },
      /mesmas chaves.*ownedColumns/i,
    ],
    [
      { ...validCleanup, ownedColumns: ["active"], resetValues: { active: null } },
      /active.*nullable/i,
    ],
  ]) {
    assert.throws(
      () =>
        validateStepExecutionContract(
          executableContract({ write: { kind: "update_exactly_one" }, cleanup }),
          mergeStep,
          executableCatalog(),
        ),
      expected,
    );
  }

  const physicalCatalog = await loadPrismaCatalog(fixturePath);
  const physicalStep = executableStep("merge", { destinationTable: "workspace_table" });
  const physicalCleanup = {
    kind: "reset_owned_columns",
    identityColumns: ["workspace_id"],
    ownedColumns: ["active"],
    resetValues: { active: true },
  };
  assert.equal(
    validateStepExecutionContract(
      executableContract({ write: { kind: "update_exactly_one" }, cleanup: physicalCleanup }),
      physicalStep,
      physicalCatalog,
    ),
    true,
  );
  assert.throws(
    () =>
      validateStepExecutionContract(
        executableContract({
          write: { kind: "update_exactly_one" },
          cleanup: { ...physicalCleanup, resetValues: { active: false } },
        }),
        physicalStep,
        physicalCatalog,
      ),
    /active.*default/i,
  );
});

test("validateStepExecutionContract rejeita tenant fora da Castelo ou sem coluna Prisma", () => {
  assert.throws(
    () =>
      validateStepExecutionContract(
        executableContract({
          tenantScope: {
            kind: "organization_column",
            column: "organization_id",
            organizationId: "00000000-0000-0000-0000-000000000000",
          },
        }),
        executableStep(),
        executableCatalog(),
      ),
    /tenant.*Castelo/i,
  );
  const catalogWithoutTenant = executableCatalog();
  catalogWithoutTenant.models[0].fields = catalogWithoutTenant.models[0].fields.filter(
    ({ databaseName }) => databaseName !== "organization_id",
  );
  assert.throws(
    () =>
      validateStepExecutionContract(executableContract(), executableStep(), catalogWithoutTenant),
    /tenantScope.*coluna.*inexistente/i,
  );
});
