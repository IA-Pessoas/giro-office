import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GLOBAL_LOGIN_COLLISIONS_QUERY,
  GLOBAL_LOGIN_DUPLICATES_QUERY,
  runCli,
  runGlobalLoginCollisionPreflight,
} from "../global-login-collision-preflight.mjs";

test("relata migração pronta quando não há logins globais duplicados", async () => {
  const client = createClient([[]]);

  const report = await runGlobalLoginCollisionPreflight({ client });

  assert.deepEqual(report, {
    collisionCount: 0,
    collisions: [],
    migrationStatus: "READY",
    readyForMigration: true,
    transactionMode: "READ ONLY",
    writesPerformed: false,
  });
  assert.deepEqual(client.history, [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    GLOBAL_LOGIN_DUPLICATES_QUERY,
    "COMMIT",
  ]);
});

test("relata uma colisão com usuários, organizações e status sem campos sensíveis", async () => {
  const client = createClient([
    [{ login: "duplicado" }],
    [
      {
        login: "duplicado",
        organizationId: "org-1",
        organizationStatus: "active",
        password: "não deve aparecer",
        userId: "user-1",
        userStatus: "active",
      },
      {
        login: "duplicado",
        organizationId: "org-2",
        organizationStatus: "inactive",
        password: "nem este",
        userId: "user-2",
        userStatus: "inactive",
      },
    ],
  ]);

  const report = await runGlobalLoginCollisionPreflight({ client });

  assert.deepEqual(report, {
    collisionCount: 1,
    collisions: [
      {
        login: "duplicado",
        users: [
          {
            organizationId: "org-1",
            organizationStatus: "active",
            userId: "user-1",
            userStatus: "active",
          },
          {
            organizationId: "org-2",
            organizationStatus: "inactive",
            userId: "user-2",
            userStatus: "inactive",
          },
        ],
      },
    ],
    migrationStatus: "BLOCKED_BY_GLOBAL_LOGIN_COLLISIONS",
    readyForMigration: false,
    transactionMode: "READ ONLY",
    writesPerformed: false,
  });
  assert.deepEqual(client.history, [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    GLOBAL_LOGIN_DUPLICATES_QUERY,
    { text: GLOBAL_LOGIN_COLLISIONS_QUERY, values: [["duplicado"]] },
    "COMMIT",
  ]);
  assert.doesNotMatch(JSON.stringify(report), /password|senha/i);
});

test("agrupa e preserva múltiplas colisões em ordem determinística", async () => {
  const client = createClient([
    [{ login: "ana" }, { login: "bruno" }],
    [
      {
        login: "ana",
        organizationId: "org-1",
        organizationStatus: "active",
        userId: "user-1",
        userStatus: "active",
      },
      {
        login: "ana",
        organizationId: "org-2",
        organizationStatus: "active",
        userId: "user-2",
        userStatus: "inactive",
      },
      {
        login: "bruno",
        organizationId: "org-1",
        organizationStatus: "active",
        userId: "user-3",
        userStatus: "active",
      },
      {
        login: "bruno",
        organizationId: null,
        organizationStatus: null,
        userId: "user-4",
        userStatus: "active",
      },
    ],
  ]);

  const report = await runGlobalLoginCollisionPreflight({ client });

  assert.equal(report.collisionCount, 2);
  assert.deepEqual(
    report.collisions.map(({ login, users }) => [login, users.map(({ userId }) => userId)]),
    [
      ["ana", ["user-1", "user-2"]],
      ["bruno", ["user-3", "user-4"]],
    ],
  );
  assert.equal(report.readyForMigration, false);
  assert.equal(report.migrationStatus, "BLOCKED_BY_GLOBAL_LOGIN_COLLISIONS");
});

test("CLI retorna sucesso apenas com relatório pronto e sinaliza a migration bloqueada", async () => {
  const readyOutput = createSink();
  const readyExitCode = await runCli({
    createClient: () => createClient([[]]),
    env: { DATABASE_URL: "postgresql://readonly@localhost/giro" },
    stderr: createSink(),
    stdout: readyOutput,
  });
  assert.equal(readyExitCode, 0);
  assert.equal(JSON.parse(readyOutput.text).migrationStatus, "READY");

  const blockedOutput = createSink();
  const blockedExitCode = await runCli({
    createClient: () => createClient([[{ login: "duplicado" }], collisionRows()]),
    env: { DATABASE_URL: "postgresql://readonly@localhost/giro" },
    stderr: createSink(),
    stdout: blockedOutput,
  });
  assert.equal(blockedExitCode, 2);
  assert.equal(JSON.parse(blockedOutput.text).migrationStatus, "BLOCKED_BY_GLOBAL_LOGIN_COLLISIONS");
});

test("migration bloqueia colisões e inicia a versão sem recriar a constraint global histórica", async () => {
  const migration = await readFile(
    new URL("../../migrations/20260827160000_enforce_global_user_login_and_version/migration.sql", import.meta.url),
    "utf8",
  );
  const tenantRlsMigration = await readFile(
    new URL("../../migrations/20260819150000_user_service_tenant_rls/migration.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /GROUP BY "login"/);
  assert.match(migration, /HAVING COUNT\(\*\) > 1/);
  assert.match(migration, /ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1/);
  assert.doesNotMatch(migration, /CREATE UNIQUE INDEX "users_login_key"/);
  assert.match(tenantRlsMigration, /ADD CONSTRAINT "users_login_key" UNIQUE \(login\)/);
  assert.doesNotMatch(migration, /password|hash|cookie|token/i);
});

test("rollback preserva a constraint histórica e a versão dos usuários", async () => {
  const rollback = await readFile(
    new URL("../../migrations/20260827160000_enforce_global_user_login_and_version/rollback.sql", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(rollback, /DROP INDEX|DROP CONSTRAINT|DROP COLUMN|password|hash|cookie|token/i);
});

function createClient(resultRows) {
  return {
    history: [],
    queryCount: 0,
    async connect() {},
    async end() {},
    async query(query) {
      this.history.push(query);
      if (
        query === "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY" ||
        query === "COMMIT" ||
        query === "ROLLBACK"
      ) {
        return { rows: [] };
      }
      const rows = resultRows[this.queryCount] ?? [];
      this.queryCount += 1;
      return { rows };
    },
  };
}

function collisionRows() {
  return [
    {
      login: "duplicado",
      organizationId: "org-1",
      organizationStatus: "active",
      userId: "user-1",
      userStatus: "active",
    },
    {
      login: "duplicado",
      organizationId: "org-2",
      organizationStatus: "active",
      userId: "user-2",
      userStatus: "inactive",
    },
  ];
}

function createSink() {
  return {
    text: "",
    write(chunk) {
      this.text += String(chunk);
    },
  };
}
