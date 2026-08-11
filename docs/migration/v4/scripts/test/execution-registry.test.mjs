import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExecutionGroupCoverage,
  assertTransformationCoverage,
  createExecutionRegistry,
  createRuntimeEntry,
  executionStepKey,
  validateExecutionCoverage,
} from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID } from "../lib/mapping-contract.mjs";

const prismaCatalog = {
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
          prismaName: "name",
          databaseName: "name",
          prismaType: "String",
          nullable: false,
          id: false,
          unique: false,
        },
      ],
    },
  ],
};

function rule(overrides = {}) {
  return {
    sourceTable: "tb_admin.usuarios",
    status: "confirmed",
    classifySourceRow: () => ({ status: "prepared" }),
    emitRows: () => [],
    destinations: [
      {
        stepId: "usuario-insert",
        destinationTable: "execution_records",
        mode: "insert",
        identity: {
          kind: "generate",
          legacyColumn: "id",
          scope: "tb_admin.usuarios",
          namespace: "3f68d246-0b54-4a10-9415-a8845a767fb5",
        },
        columns: [
          {
            sourceColumn: "nome",
            destinationColumn: "name",
            status: "mapped",
            transformation: "normalize_name",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function cleanup(overrides = {}) {
  return {
    kind: "delete_by_identity",
    identityColumns: ["id"],
    ownedColumns: [],
    resetValues: {},
    ...overrides,
  };
}

function runtimeEntry(overrides = {}) {
  const mappingRule = rule();
  return createRuntimeEntry({
    rule: mappingRule,
    step: mappingRule.destinations[0],
    organizationId: CASTELO_ORGANIZATION_ID,
    contextRequirements: ["source:tb_admin.usuarios.id"],
    projector: (emission) => emission,
    cleanup: cleanup(),
    ...overrides,
  });
}

test("createExecutionRegistry indexa entrada congelada e rejeita propriedade duplicada", () => {
  const entry = runtimeEntry();
  const registry = createExecutionRegistry([[entry]]);

  assert.equal(registry.get("tb_admin.usuarios\0usuario-insert"), entry);
  assert.equal(executionStepKey(entry), "tb_admin.usuarios\0usuario-insert");
  assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.isFrozen(entry.contract.cleanup), true);
  assert.throws(
    () => createExecutionRegistry([[entry], [entry]]),
    /EXECUTION_CONTRACT_DUPLICATE:tb_admin\.usuarios\0usuario-insert/,
  );
});

test("createRuntimeEntry separa callbacks puros do contrato serializável e registra digests", () => {
  const entry = runtimeEntry();

  assert.equal(typeof entry.classifySourceRow, "function");
  assert.equal(typeof entry.emitRows, "function");
  assert.equal(typeof entry.projector, "function");
  assert.doesNotThrow(() => JSON.stringify(entry.contract));
  assert.deepEqual(Object.keys(entry.contract).sort(), [
    "cleanup",
    "contextRequirements",
    "projection",
    "tenantScope",
    "write",
  ]);
  assert.deepEqual(Object.keys(entry.contract.projection.callbackDigests).sort(), [
    "classifySourceRow",
    "emitRows",
    "projector",
  ]);
  for (const digest of Object.values(entry.contract.projection.callbackDigests)) {
    assert.match(digest, /^[a-f0-9]{64}$/);
  }
  assert.equal("writer" in entry, false);
  assert.equal("sql" in entry.contract, false);
});

test("constructors rejeitam callbacks de escrita e valores não serializáveis", () => {
  assert.throws(() => runtimeEntry({ writer: () => undefined }), /campo incompatível.*writer/i);
  assert.throws(
    () =>
      runtimeEntry({
        cleanup: cleanup({ resetValues: { id: () => "row-value" }, ownedColumns: ["id"] }),
      }),
    /cleanup.*não serializável/i,
  );

  const entry = runtimeEntry();
  assert.throws(
    () =>
      createExecutionRegistry([
        [
          {
            ...entry,
            contract: {
              ...entry.contract,
              projection: { kind: "column_transformers", projector: () => ({}) },
            },
          },
        ],
      ]),
    /contract.*não serializável/i,
  );
});

test("validateExecutionCoverage exige exatamente um contrato por passo confirmado", () => {
  const mappingRule = rule();
  const ruleRegistry = new Map([[mappingRule.sourceTable, mappingRule]]);
  const entry = runtimeEntry({ rule: mappingRule, step: mappingRule.destinations[0] });

  assert.equal(
    validateExecutionCoverage({
      ruleRegistry,
      executionRegistry: createExecutionRegistry([[entry]]),
      prismaCatalog,
    }),
    true,
  );
  assert.throws(
    () =>
      validateExecutionCoverage({
        ruleRegistry,
        executionRegistry: createExecutionRegistry([[]]),
        prismaCatalog,
      }),
    /cobertura ausente.*tb_admin\.usuarios.*usuario-insert/i,
  );

  const extra = Object.freeze({
    ...entry,
    sourceTable: "tb_admin.extra",
    stepId: "extra-insert",
  });
  assert.throws(
    () =>
      validateExecutionCoverage({
        ruleRegistry,
        executionRegistry: createExecutionRegistry([[entry, extra]]),
        prismaCatalog,
      }),
    /step extra.*tb_admin\.extra.*extra-insert/i,
  );
});

test("helpers de cobertura detectam steps e transformações ausentes ou extras", () => {
  const mappingRule = rule();
  const entry = runtimeEntry({ rule: mappingRule, step: mappingRule.destinations[0] });

  assert.equal(assertExecutionGroupCoverage([mappingRule], [entry]), true);
  assert.throws(
    () => assertExecutionGroupCoverage([mappingRule], []),
    /cobertura ausente.*usuario-insert/i,
  );
  assert.throws(
    () =>
      assertExecutionGroupCoverage(
        [mappingRule],
        [entry, Object.freeze({ ...entry, stepId: "extra-insert" })],
      ),
    /step extra.*extra-insert/i,
  );

  assert.equal(
    assertTransformationCoverage(
      [mappingRule],
      { normalize_name: (value) => String(value).trim() },
      [entry],
    ),
    true,
  );
  assert.throws(
    () => assertTransformationCoverage([mappingRule], {}, [entry]),
    /transformação ausente.*normalize_name/i,
  );
  assert.throws(
    () =>
      assertTransformationCoverage(
        [mappingRule],
        {
          normalize_name: (value) => String(value).trim(),
          unused_transformer: (value) => value,
        },
        [entry],
      ),
    /transformação extra.*unused_transformer/i,
  );
});

test("projetor customizado dispensa apenas as transformações do próprio passo", () => {
  const mappingRule = rule();
  const entry = runtimeEntry({
    rule: mappingRule,
    step: mappingRule.destinations[0],
    projectionKind: "custom_projector",
  });

  assert.equal(assertTransformationCoverage([mappingRule], {}, [entry]), true);
});
