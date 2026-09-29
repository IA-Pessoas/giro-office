import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFile,
  cp,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildConfirmedScope } from "../lib/confirmed-scope.mjs";
import { createExecutionSession, getExecutionResultMetadata } from "../lib/execution-engine.mjs";
import { createExecutionRegistry, createRuntimeEntry } from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID } from "../lib/mapping-contract.mjs";
import { cleanupMappedData } from "../lib/migration-runner.mjs";

const fixturesDirectory = path.join(import.meta.dirname, "fixtures");
const stepKey = "legacy.child\0child-insert";

test("iterateStep percorre o dump até EOF, projeta payload efêmero e resume sem sensíveis", async () => {
  const session = await createExecutionSession(await executionFixture());
  const rows = [];

  for await (const emission of session.iterateStep(stepKey)) rows.push(emission);

  assert.deepEqual(
    rows.map(({ status }) => status),
    ["prepared", "not_emitted", "quarantine"],
  );
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    "destinationIdentity",
    "payload",
    "sourceIdentityDigest",
    "sourceTable",
    "status",
    "stepId",
  ]);
  assert.deepEqual(rows[0].payload, {
    cpf: "123.456.789-09",
    parentId: "10",
    senha: "segredo-preparado",
  });
  for (const row of rows) assert.match(row.sourceIdentityDigest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(rows[1], {
    sourceTable: "legacy.child",
    stepId: "child-insert",
    status: "not_emitted",
    sourceIdentityDigest: rows[1].sourceIdentityDigest,
    reasonCode: "CHILD_EXPLICITLY_OMITTED",
  });
  assert.deepEqual(rows[2], {
    sourceTable: "legacy.child",
    stepId: "child-insert",
    status: "quarantine",
    sourceIdentityDigest: rows[2].sourceIdentityDigest,
    field: "parent_id",
    reasonCode: "CHILD_PARENT_NOT_FOUND",
  });
  assert.deepEqual(session.summary().counts, {
    readRows: 3,
    prepared: 1,
    notEmitted: 1,
    quarantine: 1,
    blockedRows: 0,
  });
  assert.deepEqual(Object.keys(session.summary()).sort(), ["codes", "counts", "digests"]);
  assert.doesNotMatch(
    JSON.stringify(session.summary()),
    /cpf|senha|rawRow|sourcePayload|123\.456|segredo/i,
  );
});

test("aggregate rows are grouped in memory and written once per parent", async (t) => {
  const sourceDir = await copyAggregateFixtures(t);
  const session = await createExecutionSession(
    await executionFixture({ aggregate: true, sourceDir }),
  );
  const results = [];

  for await (const result of session.iterateStep(stepKey)) results.push(result);

  assert.deepEqual(
    results.map(({ destinationIdentity, sourceRowCount }) => [destinationIdentity, sourceRowCount]),
    [
      ["parent:A", 2],
      ["parent:B", 1],
    ],
  );
  assert.deepEqual(
    results[0].payload.children.map(({ legacyId }) => legacyId),
    [1, 3],
  );
});

test("aggregate duplicate legacy child identity is quarantined instead of discarded", async (t) => {
  const sourceDir = await copyAggregateFixtures(t);
  await appendFile(
    path.join(sourceDir, "execution-child.sql"),
    "\nINSERT INTO `legacy`.`child` (`id`, `parent_id`) VALUES (3, 'A');\n",
  );
  const session = await createExecutionSession(
    await executionFixture({ aggregate: true, childRowCount: 4, sourceDir }),
  );
  const results = await collect(session.iterateStep(stepKey));
  const duplicate = results.find(
    ({ status, reasonCode }) =>
      status === "quarantine" && reasonCode === "AGGREGATE_CHILD_IDENTITY_DUPLICATE",
  );

  assert.ok(duplicate);
  assert.equal(Object.hasOwn(duplicate, "cleanupIdentity"), false);
  assert.deepEqual(getExecutionResultMetadata(duplicate), {
    cleanupIdentity: null,
    destinationIdentity: null,
  });
  assert.deepEqual(
    results
      .filter(({ status }) => status === "prepared")
      .map(({ destinationIdentity, sourceRowCount }) => [destinationIdentity, sourceRowCount]),
    [
      ["parent:A", 2],
      ["parent:B", 1],
    ],
  );
});

test("metadata privado preserva identidade resolve já resolvida para cleanup", async () => {
  const options = {
    emitRows(row) {
      return [
        {
          stepId: "child-insert",
          destinationTable: "destination.children",
          status: "not_emitted",
          identityRef:
            row.acao === "omitir"
              ? "destination.children:resolved-user-id"
              : `destination.children:${row.id}`,
          field: null,
          reasonCode: "COLLABORATOR_CARGO_EMPTY_NO_JOB_TITLE",
        },
      ];
    },
    primaryIdentity: {
      kind: "resolve",
      sourceTable: "tb_admin.usuarios",
      sourceColumn: "id",
      targetLegacyColumn: "id",
    },
  };
  const session = await createExecutionSession(await executionFixture(options));
  const results = await collect(session.iterateStep(stepKey));
  const cargoEmpty = results.find(
    (result) =>
      getExecutionResultMetadata(result)?.destinationIdentity ===
      "destination.children:resolved-user-id",
  );

  assert.equal(Object.hasOwn(cargoEmpty, "cleanupIdentity"), false);
  assert.deepEqual(getExecutionResultMetadata(cargoEmpty), {
    cleanupIdentity: null,
    destinationIdentity: "destination.children:resolved-user-id",
  });

  const cleanupSession = await createExecutionSession(await executionFixture(options));
  const queries = [];
  await cleanupMappedData(
    {
      async query(sql, values) {
        queries.push({ sql, values });
        return { rowCount: 1, rows: [] };
      },
    },
    {
      catalog: {
        models: [
          {
            databaseName: "destination.children",
            fields: ["id", "job_title", "organization_id"].map((databaseName) => ({
              databaseName,
              relationModel: null,
            })),
          },
        ],
      },
      cleanupSession,
      steps: [
        {
          key: stepKey,
          sourceTable: "legacy.child",
          stepId: "collaborator-job-title-merge",
          destinationTable: "destination.children",
          contract: {
            tenantScope: {
              kind: "organization_column",
              column: "organization_id",
              organizationId: CASTELO_ORGANIZATION_ID,
            },
            write: { kind: "update_exactly_one" },
            cleanup: {
              kind: "reset_owned_columns",
              identityColumns: ["id"],
              ownedColumns: ["job_title"],
              resetValues: { job_title: null },
            },
          },
        },
      ],
    },
    CASTELO_ORGANIZATION_ID,
  );

  const reset = queries.find(
    ({ sql, values }) =>
      sql.includes('SET "job_title" = $1') && values.includes("resolved-user-id"),
  );
  assert.ok(reset);
  assert.equal(reset.values.includes("resolved-user-id"), true);
  assert.equal(reset.values.includes(CASTELO_ORGANIZATION_ID), true);
});

test("iterateStep detecta alteração do dump entre a abertura e o fechamento", async (t) => {
  const sourceDir = await copyExecutionFixtures(t);
  const session = await createExecutionSession(await executionFixture({ sourceDir }));
  const iterator = session.iterateStep(stepKey)[Symbol.asyncIterator]();

  assert.equal((await iterator.next()).value.status, "prepared");
  await appendFile(path.join(sourceDir, "execution-child.sql"), "\n-- drift durante leitura\n");

  await assert.rejects(async () => {
    while (!(await iterator.next()).done) {
      // Consome até o fechamento, onde o digest e os metadados são revalidados.
    }
  }, /SOURCE_DUMP_DRIFT/);
  assert.equal(session.summary().counts.blockedRows, 1);
});

test("cancelamento limpo fecha o iterador sem falso drift", async () => {
  const session = await createExecutionSession(await executionFixture());
  const iterator = session.iterateStep(stepKey)[Symbol.asyncIterator]();

  assert.equal((await iterator.next()).value.status, "prepared");
  await assert.doesNotReject(iterator.return());
  assert.equal(session.summary().counts.blockedRows, 0);
});

test("cancelamento com mutação revalida o dump e detecta drift", async (t) => {
  const sourceDir = await copyExecutionFixtures(t);
  const session = await createExecutionSession(await executionFixture({ sourceDir }));
  const iterator = session.iterateStep(stepKey)[Symbol.asyncIterator]();

  await iterator.next();
  await appendFile(
    path.join(sourceDir, "execution-child.sql"),
    "\n-- drift antes do cancelamento\n",
  );

  await assert.rejects(iterator.return(), /SOURCE_DUMP_DRIFT/);
});

test("erro de callback com mutação prioriza drift e fecha o FileHandle", async (t) => {
  const sourceDir = await copyExecutionFixtures(t);
  const childPath = path.join(sourceDir, "execution-child.sql");
  const session = await createExecutionSession(
    await executionFixture({
      sourceDir,
      async projector() {
        await appendFile(childPath, "\n-- drift no callback\n");
        throw new Error("senha=nao-pode-vazar");
      },
    }),
  );

  await assert.rejects(async () => collect(session.iterateStep(stepKey)), /SOURCE_DUMP_DRIFT/);
  await assertNoOpenDescriptor(childPath);
});

test("erro de callback sem mutação é sanitizado e fecha o FileHandle", async (t) => {
  const sourceDir = await copyExecutionFixtures(t);
  const childPath = path.join(sourceDir, "execution-child.sql");
  const session = await createExecutionSession(
    await executionFixture({
      sourceDir,
      projector() {
        throw new Error("cpf=123.456.789-09");
      },
    }),
  );

  await assert.rejects(
    async () => collect(session.iterateStep(stepKey)),
    /EXECUTION_CALLBACK_FAILED/,
  );
  await assertNoOpenDescriptor(childPath);
});

test("erro de parser revalida o dump e fecha o FileHandle", async (t) => {
  const sourceDir = await copyExecutionFixtures(t);
  const childPath = path.join(sourceDir, "execution-child.sql");
  await appendFile(
    childPath,
    "\nINSERT INTO `legacy`.`child` (`id`, `parent_id`) VALUES (4, 'sem-fechamento);\n",
  );
  const session = await createExecutionSession(await executionFixture({ sourceDir }));

  await assert.rejects(async () => collect(session.iterateStep(stepKey)), /Erro no parser SQL/);
  await assertNoOpenDescriptor(childPath);
});

test("iterateStep falha fechado quando emitRows omite a decisão do step", async () => {
  const session = await createExecutionSession(await executionFixture({ emitRows: () => [] }));

  await assert.rejects(async () => collect(session.iterateStep(stepKey)), /STEP_EMISSION_MISSING/);
  assert.equal(session.summary().counts.blockedRows, 1);
});

test("iterateStep rejeita uma segunda execução do mesmo step", async () => {
  const session = await createExecutionSession(await executionFixture());

  await collect(session.iterateStep(stepKey));
  await assert.rejects(async () => collect(session.iterateStep(stepKey)), /STEP_ALREADY_ITERATED/);
});

test("sessão rejeita stepKey duplicado no escopo mesmo com destinos diferentes", async () => {
  await assert.rejects(
    async () => createExecutionSession(await executionFixture({ duplicateScopeStep: true })),
    /EXECUTION_STEP_DUPLICATE/,
  );
});

test("sessão captura e congela o contexto antes de executar callbacks", async () => {
  const configuration = { batchSize: 500, runtime: { marker: "original" } };
  const fixture = await executionFixture({ configuration });
  const session = await createExecutionSession(fixture);
  configuration.runtime.marker = "mutado-fora";

  const [prepared] = await collect(session.iterateStep(stepKey));

  assert.equal(prepared.payload.contextMarker, "original");
});

test("requisito de destino declarado fornece lookup congelado ao step", async () => {
  const destinationRequirement = "destination:destination.parents.email";
  async function* destinationReader({ destinationTable }) {
    if (destinationTable === "destination.parents") {
      yield {
        id: "destination-parent-1",
        organization_id: CASTELO_ORGANIZATION_ID,
        email: "Parent@Example.com",
      };
      yield {
        id: "destination-parent-other-tenant",
        organization_id: "00000000-0000-0000-0000-000000000000",
        email: "Parent@Example.com",
      };
      yield {
        id: "destination-parent-without-tenant",
        email: "Parent@Example.com",
      };
    }
  }
  const session = await createExecutionSession(
    await executionFixture({
      contextRequirements: ["source:legacy.parent.id", destinationRequirement],
      destinationReader,
      projector(_emission, _row, context) {
        const matches = context.lookupDestination(destinationRequirement, "parent@example.com");
        return { matches, frozen: Object.isFrozen(matches) };
      },
    }),
  );

  const [prepared] = await collect(session.iterateStep(stepKey));

  assert.deepEqual(prepared.payload, {
    matches: ["destination-parent-1"],
    frozen: true,
  });
});

test("lookup de destino combina linhas atuais e candidatos planejados do runtime", async () => {
  const destinationRequirement = "destination:destination.parents.email";
  async function* destinationReader() {
    yield {
      id: "destination-current",
      organization_id: CASTELO_ORGANIZATION_ID,
      email: "parent@example.com",
    };
  }
  const session = await createExecutionSession(
    await executionFixture({
      contextRequirements: ["source:legacy.parent.id", destinationRequirement],
      destinationReader,
      runtimeStateByStep: new Map([
        [
          stepKey,
          Object.freeze({
            lookupDestination: () => Object.freeze(["destination-planned"]),
          }),
        ],
      ]),
      projector(_emission, _row, context) {
        return { matches: context.lookupDestination(destinationRequirement, "parent@example.com") };
      },
    }),
  );

  const [prepared] = await collect(session.iterateStep(stepKey));

  assert.deepEqual(prepared.payload.matches, ["destination-current", "destination-planned"]);
});

test("cada step acessa somente os requisitos declarados no próprio contrato", async () => {
  const parentStepKey = "legacy.parent\0step-00";
  const session = await createExecutionSession(
    await executionFixture({
      entryOverrides: new Map([
        [
          parentStepKey,
          {
            projector(_emission, _row, context) {
              return { leaked: context.lookupSource("source:legacy.parent.id", "10") };
            },
          },
        ],
      ]),
    }),
  );

  await assert.rejects(
    async () => collect(session.iterateStep(parentStepKey)),
    /EXECUTION_CALLBACK_FAILED/,
  );
});

test("índice sem coluna de ID retorna digest, nunca a chave natural bruta", async (t) => {
  const sourceDir = await copyExecutionFixtures(t);
  await writeFile(
    path.join(sourceDir, "execution-parent.sql"),
    "INSERT INTO `legacy`.`parent` (`email`, `nome`) VALUES\n" +
      "  ('Pessoa@Example.com', 'Pessoa A'),\n" +
      "  ('Outra@Example.com', 'Pessoa B');\n",
  );
  const requirement = "source:legacy.parent.email";
  const session = await createExecutionSession(
    await executionFixture({
      sourceDir,
      contextRequirements: ["source:legacy.parent.id", requirement],
      emitRows: preparedChildEmission,
      projector(_emission, _row, context) {
        return { matches: context.lookupSource(requirement, "pessoa@example.com") };
      },
    }),
  );

  const [prepared] = await collect(session.iterateStep(stepKey));

  assert.equal(prepared.payload.matches.length, 1);
  assert.match(prepared.payload.matches[0], /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(prepared.payload), /Pessoa@Example\.com/i);
});

test("callback não consegue mutar o contexto congelado", async () => {
  const session = await createExecutionSession(
    await executionFixture({
      projector(emission, row, context) {
        context.runtime.marker = "mutado-dentro";
        return { id: emission.identityRef, rowId: row.id };
      },
    }),
  );

  await assert.rejects(
    async () => collect(session.iterateStep(stepKey)),
    /EXECUTION_CALLBACK_FAILED/,
  );
});

test("candidateProvider limita transporte a 500 sem truncar o total em EOF", async () => {
  async function* destinationReader() {
    for (let index = 0; index < 501; index += 1) {
      yield {
        id: `candidate-${index}`,
        cpf: index === 500 ? "123.456.789-09" : null,
        toJSON() {
          throw new Error("candidate não pode ser serializado");
        },
      };
    }
  }
  const session = await createExecutionSession(
    await executionFixture({ destinationReader, configuration: { batchSize: 500 } }),
  );
  const batches = [];

  for await (const batch of session.candidateProvider()) batches.push(batch);

  assert.deepEqual(
    batches.map(({ length }) => length),
    [500, 1],
  );
  assert.equal(batches.flat().length, 501);
  assert.equal(batches[1][0].cpf, "123.456.789-09");
  assert.doesNotMatch(JSON.stringify(session.summary()), /123\.456|cpf|candidate-500/i);
});

test("candidateProvider sanitiza falha do reader sem expor o candidato", async () => {
  async function* destinationReader() {
    yield { id: "candidate-ok" };
    throw new Error("cpf=123.456.789-09");
  }
  const session = await createExecutionSession(await executionFixture({ destinationReader }));

  await assert.rejects(
    async () => collect(session.candidateProvider()),
    (error) => {
      assert.equal(error.code, "DESTINATION_READER_FAILED");
      assert.doesNotMatch(error.message, /cpf|123\.456/i);
      return true;
    },
  );
});

test("sessão rejeita batch configurado acima do teto de 500", async () => {
  await assert.rejects(
    async () =>
      createExecutionSession(await executionFixture({ configuration: { batchSize: 501 } })),
    /EXECUTION_BATCH_LIMIT_EXCEEDED/,
  );
});

test("sessão rejeita requisito que tenta incluir origem fora do escopo confirmado", async () => {
  await assert.rejects(
    async () =>
      createExecutionSession(
        await executionFixture({ contextRequirements: ["source:legacy.outside.id"] }),
      ),
    /EXECUTION_SOURCE_OUT_OF_SCOPE/,
  );
});

test("sessão indexa dependência autenticada no inventário mesmo fora do escopo executável", async (t) => {
  const sourceDir = await copyExecutionFixtures(t);
  await writeFile(
    path.join(sourceDir, "execution-dependency.sql"),
    "INSERT INTO `legacy`.`dependency` (`id`, `nome`) VALUES (7, 'Dependência');\n",
  );
  const session = await createExecutionSession(
    await executionFixture({
      contextRequirements: [
        "source:legacy.parent.id",
        "source:legacy.dependency",
        "source:legacy.dependency.id",
      ],
      inventoryDependency: true,
      projector(_emission, _row, context) {
        return {
          dependencyIds: context.lookupSource("source:legacy.dependency.id", 7),
        };
      },
      sourceDir,
    }),
  );

  const [prepared] = await collect(session.iterateStep(stepKey));

  assert.deepEqual(prepared.payload, { dependencyIds: ["7"] });
});

test("estado de runtime é selecionado por step sem contaminar métodos homônimos", async () => {
  const siblingKey = "legacy.child\0step-01";
  const entryOverrides = new Map([
    [
      stepKey,
      {
        projector(_emission, _row, context) {
          return { owner: context.resolveOwner() };
        },
      },
    ],
    [
      siblingKey,
      {
        contextRequirements: ["source:legacy.parent.id"],
        projector(_emission, _row, context) {
          return { owner: context.resolveOwner() };
        },
      },
    ],
  ]);
  const runtimeStateByStep = new Map([
    [stepKey, Object.freeze({ resolveOwner: () => "domain-a" })],
    [siblingKey, Object.freeze({ resolveOwner: () => "domain-b" })],
  ]);
  const session = await createExecutionSession(
    await executionFixture({
      emitRows: preparedChildEmission,
      entryOverrides,
      runtimeStateByStep,
    }),
  );

  const primary = await collect(session.iterateStep(stepKey));
  const sibling = await collect(session.iterateStep(siblingKey));

  assert.equal(primary[0].payload.owner, "domain-a");
  assert.equal(sibling[0].payload.owner, "domain-b");
});

test("sessão exige registry completo para os 133 steps do escopo", async () => {
  await assert.rejects(
    async () => createExecutionSession(await executionFixture({ registryCoverage: "partial" })),
    /EXECUTION_REGISTRY_INCOMPLETE/,
  );
});

async function executionFixture({
  aggregate = false,
  childRowCount = 3,
  sourceDir = fixturesDirectory,
  emitRows = defaultEmitRows,
  projector = defaultProjector,
  contextRequirements = ["source:legacy.parent.id"],
  destinationReader = async function* emptyDestinationReader() {},
  configuration = { batchSize: 500 },
  duplicateScopeStep = false,
  entryOverrides = new Map(),
  inventoryDependency = false,
  registryCoverage = "complete",
  runtimeStateByStep,
  primaryIdentity,
} = {}) {
  const mappingPackage = await createMappingPackage(sourceDir, {
    childRowCount,
    duplicateScopeStep,
    inventoryDependency,
  });
  const scope = buildConfirmedScope({
    inventory: mappingPackage.inventory,
    tableMappings: mappingPackage.tableMappings,
    destinationMappings: mappingPackage.destinationMappings,
    sourceDigest: mappingPackage.inventory.sourceDigest,
    pendingMappings: mappingPackage.pendingMappings,
  });
  const { ruleRegistry, executionRegistry } = createFixtureRegistries({
    mappingPackage,
    emitRows,
    projector,
    contextRequirements,
    entryOverrides,
    registryCoverage,
    aggregate,
    primaryIdentity,
  });

  return {
    scope,
    sourceDir,
    mappingPackage,
    ruleRegistry,
    executionRegistry,
    organizationId: CASTELO_ORGANIZATION_ID,
    destinationReader,
    configuration,
    runtimeStateByStep,
  };
}

function createFixtureRegistries({
  mappingPackage,
  emitRows,
  projector,
  contextRequirements,
  entryOverrides,
  registryCoverage,
  aggregate,
  primaryIdentity,
}) {
  const destinationsBySource = Map.groupBy(
    mappingPackage.destinationMappings,
    ({ sourceTable }) => sourceTable,
  );
  const rules = [];
  const entries = [];
  for (const [sourceTable, destinations] of destinationsBySource) {
    const seenStepIds = new Set();
    const steps = destinations
      .filter(({ stepId }) => {
        if (seenStepIds.has(stepId)) return false;
        seenStepIds.add(stepId);
        return true;
      })
      .map(({ stepId, destinationTable }) => ({
        stepId,
        destinationTable,
        mode:
          aggregate && sourceTable === "legacy.child" && stepId === "child-insert"
            ? "aggregate"
            : "insert",
        ...(sourceTable === "legacy.child" && stepId === "child-insert"
          ? {
              identity:
                primaryIdentity ??
                (aggregate
                  ? {
                      kind: "aggregate",
                      parentSourceTable: "legacy.parent",
                      parentLegacyColumn: "id",
                      childForeignKey: "parent_id",
                    }
                  : undefined),
            }
          : {}),
      }));
    const rule = createFixtureRule({ aggregate, sourceTable, steps, emitRows });
    rules.push(rule);
    for (const step of steps) {
      const key = `${sourceTable}\0${step.stepId}`;
      const override = entryOverrides.get(key) ?? {};
      const isPrimary = key === stepKey;
      entries.push(
        createRuntimeEntry({
          rule,
          step,
          organizationId: CASTELO_ORGANIZATION_ID,
          contextRequirements:
            override.contextRequirements ?? (isPrimary ? contextRequirements : []),
          projector: override.projector ?? (isPrimary ? projector : defaultFixtureProjector),
          cleanup: {
            kind: step.mode === "aggregate" ? "replace_owned_aggregate" : "delete_by_identity",
            identityColumns: ["id"],
            ownedColumns: step.mode === "aggregate" ? ["children"] : [],
            resetValues: step.mode === "aggregate" ? { children: null } : {},
          },
        }),
      );
    }
  }
  const selectedEntries =
    registryCoverage === "partial"
      ? entries.filter(({ sourceTable, stepId }) => `${sourceTable}\0${stepId}` === stepKey)
      : entries;
  return {
    ruleRegistry: new Map(rules.map((rule) => [rule.sourceTable, rule])),
    executionRegistry: createExecutionRegistry([selectedEntries]),
  };
}

function createFixtureRule({ aggregate, sourceTable, steps, emitRows }) {
  const isChild = sourceTable === "legacy.child";
  const isAggregate = aggregate && isChild;
  return {
    sourceTable,
    status: "confirmed",
    destinations: steps,
    classifySourceRow:
      isChild && !isAggregate ? defaultClassifySourceRow : () => ({ status: "prepared" }),
    emitRows(row, context) {
      const primaryEmissions = isChild
        ? isAggregate
          ? [aggregatePreparedDecision(row)]
          : emitRows(row, context)
        : [];
      return [
        ...primaryEmissions,
        ...steps
          .filter(({ stepId }) => !(isChild && stepId === "child-insert"))
          .map((step) => fixturePreparedDecision(sourceTable, step, row)),
      ];
    },
  };
}

function fixturePreparedDecision(_sourceTable, step, row) {
  return {
    stepId: step.stepId,
    destinationTable: step.destinationTable,
    status: "prepared",
    identityRef: `${step.destinationTable}:${row?.id ?? "missing"}`,
    field: null,
    reasonCode: null,
  };
}

function defaultFixtureProjector(emission) {
  return { id: emission.identityRef };
}

function aggregatePreparedDecision(row) {
  return {
    stepId: "child-insert",
    destinationTable: "destination.children",
    status: "prepared",
    identityRef: `parent:${row.parent_id}`,
    field: null,
    reasonCode: null,
  };
}

function defaultClassifySourceRow(row, context) {
  if (row.acao === "omitir") return { status: "not_emitted" };
  return context.lookupSource("source:legacy.parent.id", row.parent_id).length === 1
    ? { status: "prepared" }
    : { status: "quarantine" };
}

function defaultEmitRows(row, context) {
  const parentIds = context.lookupSource("source:legacy.parent.id", row.parent_id);
  const classification =
    row.acao === "omitir"
      ? { status: "not_emitted", reasonCode: "CHILD_EXPLICITLY_OMITTED" }
      : parentIds.length === 1
        ? { status: "prepared", reasonCode: null }
        : { status: "quarantine", reasonCode: "CHILD_PARENT_NOT_FOUND" };
  return [
    {
      stepId: "child-insert",
      destinationTable: "destination.children",
      status: classification.status,
      identityRef: `destination.children:${row.id}`,
      field: classification.status === "quarantine" ? "parent_id" : null,
      reasonCode: classification.reasonCode,
    },
  ];
}

function preparedChildEmission(row) {
  return [
    {
      stepId: "child-insert",
      destinationTable: "destination.children",
      status: "prepared",
      identityRef: `destination.children:${row.id}`,
      field: null,
      reasonCode: null,
    },
  ];
}

function defaultProjector(_emission, row, context) {
  if (Array.isArray(row)) {
    return {
      children: row.map(({ id }) => ({ legacyId: Number(id) })),
    };
  }
  return {
    cpf: row.cpf,
    parentId: context.lookupSource("source:legacy.parent.id", row.parent_id)[0],
    senha: row.senha,
    ...(context.runtime ? { contextMarker: context.runtime.marker } : {}),
  };
}

async function createMappingPackage(
  sourceDir,
  { childRowCount = 3, duplicateScopeStep = false, inventoryDependency = false } = {},
) {
  const sourceRows = [
    await inventoryTable(sourceDir, "legacy.child", "execution-child.sql", childRowCount),
    await inventoryTable(sourceDir, "legacy.parent", "execution-parent.sql", 2),
  ];
  for (let index = 0; index < 100; index += 1) {
    sourceRows.push({
      sourceTable: `legacy.placeholder_${String(index).padStart(3, "0")}`,
      fileName: `placeholder-${index}.sql`,
      relativePath: `placeholder-${index}.sql`,
      sha256: digest(`placeholder-dump:${index}`),
      rowCount: index === 0 ? 629_333 - childRowCount : 0,
    });
  }
  const destinationMappings = [];
  for (const source of sourceRows) {
    const stepCount = source.sourceTable === "legacy.child" ? 31 : 1;
    for (let index = 0; index < stepCount; index += 1) {
      const stepId =
        source.sourceTable === "legacy.child" && index === 0
          ? "child-insert"
          : `step-${String(index).padStart(2, "0")}`;
      destinationMappings.push({
        sourceTable: source.sourceTable,
        stepId,
        destinationTable:
          source.sourceTable === "legacy.child" && index === 0
            ? "destination.children"
            : `destination.placeholder_${String(index).padStart(2, "0")}`,
        dependencies: [],
        contractDigest: digest(`destination:${source.sourceTable}:${stepId}`),
      });
    }
  }
  if (duplicateScopeStep) {
    const duplicate = destinationMappings.find(
      ({ sourceTable, stepId }) => sourceTable === "legacy.child" && stepId === "step-01",
    );
    duplicate.stepId = "child-insert";
  }
  const tableMappings = sourceRows.map((source) => {
    const steps = destinationMappings.filter(
      ({ sourceTable }) => sourceTable === source.sourceTable,
    );
    return {
      sourceTable: source.sourceTable,
      sourceRowCount: source.rowCount,
      destinationStepCount: steps.length,
      destinationContractDigests: steps.map(({ contractDigest }) => contractDigest),
      dependencies: source.sourceTable === "legacy.child" ? ["legacy.parent"] : [],
      contractDigest: digest(`mapping:${source.sourceTable}`),
    };
  });
  const inventoryRows = [...sourceRows];
  if (inventoryDependency) {
    inventoryRows.push(
      await inventoryTable(sourceDir, "legacy.dependency", "execution-dependency.sql", 1),
    );
  }
  const inventory = { tables: inventoryRows };
  inventory.sourceDigest = digestSourceInventory(inventoryRows);
  return { inventory, tableMappings, destinationMappings, pendingMappings: [] };
}

async function inventoryTable(sourceDir, sourceTable, fileName, rowCount) {
  return {
    sourceTable,
    fileName,
    relativePath: fileName,
    sha256: createHash("sha256")
      .update(await readFile(path.join(sourceDir, fileName)))
      .digest("hex"),
    rowCount,
  };
}

async function copyExecutionFixtures(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "giro-v4-execution-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Promise.all(
    ["execution-parent.sql", "execution-child.sql"].map((fileName) =>
      cp(path.join(fixturesDirectory, fileName), path.join(directory, fileName)),
    ),
  );
  return directory;
}

async function copyAggregateFixtures(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "giro-v4-aggregate-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Promise.all([
    cp(
      path.join(fixturesDirectory, "aggregate-noncontiguous.sql"),
      path.join(directory, "execution-child.sql"),
    ),
    cp(
      path.join(fixturesDirectory, "execution-parent.sql"),
      path.join(directory, "execution-parent.sql"),
    ),
  ]);
  return directory;
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

async function countOpenDescriptors(filePath) {
  const target = await realpath(filePath);
  let count = 0;
  let descriptors;
  try {
    descriptors = await readdir("/proc/self/fd");
  } catch (error) {
    if (process.platform === "win32" && error?.code === "ENOENT") return null;
    throw error;
  }
  for (const descriptor of descriptors) {
    try {
      if ((await readlink(`/proc/self/fd/${descriptor}`)).replace(/ \(deleted\)$/, "") === target) {
        count += 1;
      }
    } catch {
      // O descritor pode ser fechado entre readdir e readlink.
    }
  }
  return count;
}

async function assertNoOpenDescriptor(filePath) {
  const count = await countOpenDescriptors(filePath);
  if (count !== null) assert.equal(count, 0);
}

function digestSourceInventory(tables) {
  return createHash("sha256")
    .update(
      [...tables]
        .sort((left, right) => left.sourceTable.localeCompare(right.sourceTable, "en-US"))
        .map(({ sourceTable, sha256, rowCount }) => `${sourceTable}\t${sha256}\t${rowCount}`)
        .join("\n"),
      "utf8",
    )
    .digest("hex");
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
