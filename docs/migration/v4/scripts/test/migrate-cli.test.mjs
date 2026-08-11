import assert from "node:assert/strict";
import test from "node:test";

import { CASTELO_ORGANIZATION_ID } from "../lib/mapping-contract.mjs";
import { createDestinationReader, runCli } from "../migrate.mjs";

const NOW = "2026-08-06T12:00:00.000Z";
const DATABASE_IDENTITY = `sha256:${"d".repeat(64)}`;
const ARTIFACT_BINDING = Object.freeze({
  executionDigest: "e".repeat(64),
  manifestDigest: "b".repeat(64),
  mappingDigest: "a".repeat(64),
  organizationId: CASTELO_ORGANIZATION_ID,
  sourceDigest: "c".repeat(64),
});

function acceptedDryRun(overrides = {}) {
  return {
    schemaVersion: "giro-office.migration-v4.dry-run/1",
    mode: "dry-run",
    writesPerformed: false,
    complete: true,
    createdAt: "2026-08-06T11:55:00.000Z",
    databaseIdentity: DATABASE_IDENTITY,
    organizationId: CASTELO_ORGANIZATION_ID,
    ...ARTIFACT_BINDING,
    inventoryCounts: {
      executableSources: 103,
      pendingSources: 209,
      rows: 1_374_880,
      sources: 312,
      steps: 133,
    },
    blockers: { quarantine: 0, unresolvedRequiredReferences: 0, unclassifiedSources: 0 },
    destinationCounts: {},
    expectedWriteCounts: { aggregate: 0, insert: 0, update: 0 },
    expectedWrites: 0,
    quarantine: [],
    sourceCounts: { notEmitted: 1_374_880, prepared: 0, quarantine: 0 },
    statusCounts: { notEmitted: 1_374_880, prepared: 0, quarantine: 0 },
    ...overrides,
  };
}

function acceptedSnapshot(overrides = {}) {
  return {
    schemaVersion: "giro-office.migration-v4.snapshot/1",
    createdAt: "2026-08-06T11:50:00.000Z",
    databaseIdentity: DATABASE_IDENTITY,
    restorable: true,
    ...overrides,
  };
}

function createFakeDependencies(overrides = {}) {
  const dependencies = {
    mutableClientCalls: 0,
    runDryRun: async () => acceptedDryRun(),
    loadArtifactBinding: async () => ARTIFACT_BINDING,
    now: () => new Date(NOW),
    readJson: async (filePath) => {
      if (filePath === "accepted.json") return acceptedDryRun();
      if (filePath === "snapshot.json") return acceptedSnapshot();
      throw new Error(`UNEXPECTED_PATH:${filePath}`);
    },
    createMutableClient: async () => {
      dependencies.mutableClientCalls += 1;
      return { end: async () => {}, query: async () => ({ rowCount: 1, rows: [] }) };
    },
    prepareMigration: async () => ({ executionSession: {}, plan: { steps: [] } }),
    runMigration: async () => ({ mode: "apply", writesPerformed: true }),
    ...overrides,
  };
  return dependencies;
}

test("CLI defaults to dry-run and never creates a mutable client", async () => {
  const dependencies = createFakeDependencies();

  const result = await runCli({ argv: [], env: {}, dependencies });

  assert.equal(result.mode, "dry-run");
  assert.equal(result.writesPerformed, false);
  assert.equal(dependencies.mutableClientCalls, 0);
});

test("CLI aceita --fast por argumento e por variável de ambiente no modo seco", async () => {
  let fastModeFromArgument = null;

  await runCli({
    argv: ["--fast"],
    env: { MIGRATION_FAST_MODE: "1", MIGRATION_DATABASE_IDENTITY: DATABASE_IDENTITY },
    dependencies: {
      ...createFakeDependencies(),
      runDryRun: async ({ fastMode }) => {
        if (fastModeFromArgument === null) fastModeFromArgument = fastMode;
        return acceptedDryRun();
      },
    },
  });
  assert.equal(fastModeFromArgument, true);
});

test("CLI aceita prefixo -- do pnpm/exec com --fast", async () => {
  let fastModeFromArgument = null;

  await runCli({
    argv: ["--", "--fast"],
    env: { MIGRATION_FAST_MODE: "true", MIGRATION_DATABASE_IDENTITY: DATABASE_IDENTITY },
    dependencies: {
      ...createFakeDependencies(),
      runDryRun: async ({ fastMode }) => {
        fastModeFromArgument = fastMode;
        return acceptedDryRun();
      },
    },
  });
  assert.equal(fastModeFromArgument, true);
});

test("CLI dry-run uses the production adapter without importing a mutable client", async () => {
  let dryRunCalls = 0;

  const result = await runCli({
    argv: [],
    env: {},
    dependencies: {
      executeDryRun: async () => {
        dryRunCalls += 1;
        return { complete: false, expectedWrites: 0 };
      },
      createMutableClient: async () => {
        throw new Error("MUTABLE_CLIENT_MUST_NOT_BE_CREATED");
      },
    },
  });

  assert.equal(dryRunCalls, 1);
  assert.equal(result.mode, "dry-run");
  assert.equal(result.complete, false);
  assert.equal(result.writesPerformed, false);
});

test("CLI dry-run conectado usa somente a fachada transacional read-only", async () => {
  const rawClient = { query: async () => ({ rows: [] }) };
  const transaction = Object.freeze({ query: async () => ({ rows: [] }) });
  let selectedDatabaseUrl;
  let receivedDestinationClient;
  const dependencies = createFakeDependencies({
    runDryRun: undefined,
    createReadOnlyClient: async ({ databaseUrl }) => {
      selectedDatabaseUrl = databaseUrl;
      return rawClient;
    },
    withReadOnlyTransaction: async (client, callback) => {
      assert.equal(client, rawClient);
      return callback(transaction);
    },
    executeDryRun: async ({ destinationClient }) => {
      receivedDestinationClient = destinationClient;
      return { complete: false, expectedWrites: 0 };
    },
  });
  delete dependencies.runDryRun;

  const result = await runCli({
    argv: [],
    env: { DATABASE_URL: "postgresql://readonly@localhost/giro" },
    dependencies,
  });

  assert.equal(selectedDatabaseUrl, "postgresql://readonly@localhost/giro");
  assert.equal(receivedDestinationClient, transaction);
  assert.equal(dependencies.mutableClientCalls, 0);
  assert.equal(result.writesPerformed, false);
});

test("apply requires Castelo, accepted dry-run, snapshot and database URL", async () => {
  const cases = [
    {
      argv: ["--apply"],
      env: {},
    },
    {
      argv: [
        "--apply",
        "--tenant",
        "00000000-0000-0000-0000-000000000000",
        "--dry-run-report",
        "accepted.json",
        "--snapshot-manifest",
        "snapshot.json",
      ],
      env: { MIGRATION_DATABASE_URL: "postgres://local.invalid/db" },
    },
    {
      argv: [
        "--apply",
        "--tenant",
        CASTELO_ORGANIZATION_ID,
        "--dry-run-report",
        "accepted.json",
        "--snapshot-manifest",
        "snapshot.json",
      ],
      env: {},
    },
  ];

  for (const options of cases) {
    const dependencies = createFakeDependencies();
    await assert.rejects(runCli({ ...options, dependencies }), /MIGRATION_APPLY_GUARD_FAILED/);
    assert.equal(dependencies.mutableClientCalls, 0);
  }
});

test("CLI rejeita --fast no modo apply", async () => {
  await assert.rejects(
    runCli({
      argv: [
        "--apply",
        "--fast",
        "--tenant",
        CASTELO_ORGANIZATION_ID,
        "--dry-run-report",
        "accepted.json",
        "--snapshot-manifest",
        "snapshot.json",
      ],
      env: {
        MIGRATION_DATABASE_URL: "postgres://local.invalid/db",
      },
      dependencies: {
        ...createFakeDependencies(),
        runDryRun: undefined,
      },
    }),
    /MIGRATION_APPLY_GUARD_FAILED/,
  );
});

test("apply rejects incomplete report and non-restorable snapshot before mutable client", async () => {
  const base = [
    "--apply",
    "--tenant",
    CASTELO_ORGANIZATION_ID,
    "--dry-run-report",
    "accepted.json",
    "--snapshot-manifest",
    "snapshot.json",
  ];
  const env = { MIGRATION_DATABASE_URL: "postgres://local.invalid/db" };
  const cases = [
    createFakeDependencies({
      readJson: async (filePath) =>
        filePath === "accepted.json" ? acceptedDryRun({ complete: false }) : acceptedSnapshot(),
    }),
    createFakeDependencies({
      readJson: async (filePath) =>
        filePath === "accepted.json" ? acceptedDryRun() : acceptedSnapshot({ restorable: false }),
    }),
  ];

  for (const dependencies of cases) {
    await assert.rejects(runCli({ argv: base, env, dependencies }), /MIGRATION_APPLY_GUARD_FAILED/);
    assert.equal(dependencies.mutableClientCalls, 0);
  }
});

test("apply rejeita artefato fabricado, campo extra e relatório stale antes do cliente", async () => {
  const argv = [
    "--apply",
    "--tenant",
    CASTELO_ORGANIZATION_ID,
    "--dry-run-report",
    "accepted.json",
    "--snapshot-manifest",
    "snapshot.json",
  ];
  const env = { MIGRATION_DATABASE_URL: "postgres://local.invalid/db" };
  const invalidReports = [
    { complete: true, writesPerformed: false },
    acceptedDryRun({ unexpected: true }),
    acceptedDryRun({ createdAt: "2026-08-05T10:00:00.000Z" }),
    acceptedDryRun({ mappingDigest: "f".repeat(64) }),
  ];
  for (const report of invalidReports) {
    const dependencies = createFakeDependencies({
      readJson: async (filePath) => (filePath === "accepted.json" ? report : acceptedSnapshot()),
    });
    await assert.rejects(runCli({ argv, env, dependencies }), /MIGRATION_APPLY_GUARD_FAILED/);
    assert.equal(dependencies.mutableClientCalls, 0);
  }
});

test("apply rejeita métricas fabricadas antes de criar o cliente mutável", async () => {
  const argv = [
    "--apply",
    "--tenant",
    CASTELO_ORGANIZATION_ID,
    "--dry-run-report",
    "accepted.json",
    "--snapshot-manifest",
    "snapshot.json",
  ];
  const env = { MIGRATION_DATABASE_URL: "postgres://local.invalid/db" };
  const invalidReports = [
    ["sourceCounts sem campo", acceptedDryRun({ sourceCounts: { prepared: 0, quarantine: 0 } })],
    [
      "sourceCounts com campo extra",
      acceptedDryRun({
        sourceCounts: { notEmitted: 1_374_880, prepared: 0, quarantine: 0, skipped: 0 },
      }),
    ],
    [
      "sourceCounts divergente do inventário",
      acceptedDryRun({ sourceCounts: { notEmitted: 1_374_879, prepared: 0, quarantine: 0 } }),
    ],
    ["statusCounts sem campo", acceptedDryRun({ statusCounts: { prepared: 0, quarantine: 0 } })],
    [
      "statusCounts com campo extra",
      acceptedDryRun({
        statusCounts: { notEmitted: 1_374_880, prepared: 0, quarantine: 0, skipped: 0 },
      }),
    ],
    [
      "statusCounts divergente dos blockers",
      acceptedDryRun({
        statusCounts: { notEmitted: 1_374_879, prepared: 0, quarantine: 1 },
      }),
    ],
    [
      "expectedWriteCounts sem campo",
      acceptedDryRun({ expectedWriteCounts: { insert: 0, update: 0 } }),
    ],
    [
      "expectedWriteCounts com campo extra",
      acceptedDryRun({
        expectedWriteCounts: { aggregate: 0, insert: 0, update: 0, delete: 0 },
      }),
    ],
    [
      "expectedWriteCounts divergente de expectedWrites",
      acceptedDryRun({
        expectedWriteCounts: { aggregate: 0, insert: 1, update: 0 },
        expectedWrites: 0,
      }),
    ],
    [
      "destinationCounts sem campo",
      acceptedDryRun({ destinationCounts: { records: { prepared: 0, quarantine: 0 } } }),
    ],
    [
      "destinationCounts com campo extra",
      acceptedDryRun({
        destinationCounts: {
          records: { notEmitted: 0, prepared: 0, quarantine: 0, skipped: 0 },
        },
      }),
    ],
    [
      "destinationCounts com métrica negativa",
      acceptedDryRun({
        destinationCounts: { records: { notEmitted: 0, prepared: -1, quarantine: 0 } },
      }),
    ],
    [
      "destinationCounts divergente de expectedWrites",
      acceptedDryRun({
        destinationCounts: {},
        expectedWriteCounts: { aggregate: 0, insert: 1, update: 0 },
        expectedWrites: 1,
        statusCounts: { notEmitted: 1_374_879, prepared: 1, quarantine: 0 },
      }),
    ],
    ["quarantine não vazio", acceptedDryRun({ quarantine: [{ reasonCode: "FABRICATED" }] })],
  ];

  for (const [name, report] of invalidReports) {
    const dependencies = createFakeDependencies({
      readJson: async (filePath) => (filePath === "accepted.json" ? report : acceptedSnapshot()),
    });
    await assert.rejects(runCli({ argv, env, dependencies }), /MIGRATION_APPLY_GUARD_FAILED/, name);
    assert.equal(dependencies.mutableClientCalls, 0, name);
  }
});

test("apply creates and closes the mutable client only after every guard passes", async () => {
  const events = [];
  const dependencies = createFakeDependencies({
    createMutableClient: async () => {
      dependencies.mutableClientCalls += 1;
      events.push("client");
      return {
        end: async () => events.push("close"),
        query: async () => ({ rowCount: 1, rows: [] }),
      };
    },
    prepareMigration: async () => {
      events.push("prepare");
      return { executionSession: {}, plan: { steps: [] } };
    },
    runMigration: async (options) => {
      events.push("migrate");
      assert.equal(options.organizationId, CASTELO_ORGANIZATION_ID);
      assert.equal(options.dryRunReport.complete, true);
      assert.equal(options.snapshotManifest.restorable, true);
      return { mode: "apply", writesPerformed: true };
    },
  });

  const result = await runCli({
    argv: [
      "--apply",
      "--tenant",
      CASTELO_ORGANIZATION_ID,
      "--dry-run-report",
      "accepted.json",
      "--snapshot-manifest",
      "snapshot.json",
    ],
    env: { MIGRATION_DATABASE_URL: "postgres://local.invalid/db" },
    dependencies,
  });

  assert.deepEqual(events, ["client", "prepare", "migrate", "close"]);
  assert.equal(result.mode, "apply");
});

test("apply uses production adapters after guards and closes their client", async () => {
  const events = [];
  const client = {
    end: async () => events.push("close"),
    query: async () => ({ rowCount: 1, rows: [] }),
  };
  const dependencies = {
    readJson: async (filePath) =>
      filePath === "accepted.json" ? acceptedDryRun() : acceptedSnapshot(),
    loadArtifactBinding: async () => ARTIFACT_BINDING,
    now: () => new Date(NOW),
    createPostgresClient: async (connectionString) => {
      events.push("postgres");
      assert.equal(connectionString, "postgres://local.invalid/db");
      return client;
    },
    buildMigrationInputs: async (options) => {
      events.push("inputs");
      assert.equal(options.client, client);
      return { executionSession: {}, plan: { steps: [] } };
    },
    runMigration: async () => {
      events.push("migrate");
      return { mode: "apply", writesPerformed: true };
    },
  };

  await runCli({
    argv: [
      "--apply",
      "--tenant",
      CASTELO_ORGANIZATION_ID,
      "--dry-run-report",
      "accepted.json",
      "--snapshot-manifest",
      "snapshot.json",
    ],
    env: { MIGRATION_DATABASE_URL: "postgres://local.invalid/db" },
    dependencies,
  });

  assert.deepEqual(events, ["postgres", "inputs", "migrate", "close"]);
});

test("destination reader uses the catalog primary key instead of assuming an id column", async () => {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      return queries.length === 1
        ? {
            rows: [
              {
                client_id: "client-1",
                organization_id: CASTELO_ORGANIZATION_ID,
              },
            ],
          }
        : { rows: [] };
    },
  };
  const prismaCatalog = {
    models: [
      {
        databaseName: "clients.pa",
        fields: [
          { databaseName: "client_id", id: true, relationModel: null },
          { databaseName: "organization_id", id: false, relationModel: null },
        ],
      },
    ],
  };
  const reader = createDestinationReader(client, prismaCatalog, CASTELO_ORGANIZATION_ID);
  const batches = [];

  for await (const batch of reader({
    destinationTable: "clients.pa",
    columns: ["client_id"],
    organizationId: CASTELO_ORGANIZATION_ID,
    batchSize: 500,
  })) {
    batches.push(batch);
  }

  assert.equal(batches[0][0].client_id, "client-1");
  assert.match(queries[0].sql, /SELECT "client_id", "organization_id" FROM "clients\.pa"/);
  assert.match(queries[0].sql, /ORDER BY "client_id"/);
  assert.doesNotMatch(queries[0].sql, /SELECT "id"|ORDER BY "id"/);
  assert.deepEqual(queries[0].values, [CASTELO_ORGANIZATION_ID, 500, 0]);
});
