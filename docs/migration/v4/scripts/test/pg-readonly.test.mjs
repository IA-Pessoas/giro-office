import assert from "node:assert/strict";
import test from "node:test";

import {
  assertReadOnlyQuery,
  createReadOnlyClient,
  withReadOnlyTransaction,
} from "../lib/pg-readonly.mjs";

test("assertReadOnlyQuery aceita somente SELECT e WITH finalizado por SELECT", () => {
  assert.doesNotThrow(() => assertReadOnlyQuery("SELECT id FROM public.users WHERE id = $1"));
  assert.doesNotThrow(() =>
    assertReadOnlyQuery({
      text: "WITH selected AS (SELECT id FROM public.users) SELECT id FROM selected",
      values: ["4e6ae95e-4d73-4e6d-8954-10be339a7cc8"],
    }),
  );
});

test("assertReadOnlyQuery rejeita mutação, evasão, múltiplas instruções e lock", () => {
  const rejected = [
    "INSERT INTO users (id) VALUES ($1)",
    "UPDATE users SET name = $1",
    "DELETE FROM users",
    "TRUNCATE users",
    "COPY users TO STDOUT",
    "MERGE INTO users USING incoming ON true WHEN MATCHED THEN DELETE",
    "CREATE TABLE unsafe (id integer)",
    "ALTER TABLE users ADD COLUMN unsafe text",
    "DROP TABLE users",
    "GRANT SELECT ON users TO public",
    "REVOKE SELECT ON users FROM public",
    "CALL unsafe_procedure()",
    "DO $$ BEGIN NULL; END $$",
    "WITH changed AS (UPDATE users SET name = $1 RETURNING id) SELECT id FROM changed",
    "SELECT id INTO unsafe_copy FROM users",
    "SELECT id FROM users FOR UPDATE",
    "SELECT id FROM users FOR NO KEY UPDATE",
    "SELECT id FROM users FOR SHARE",
    "SELECT id FROM users FOR KEY SHARE",
    "SELECT id FROM users; SELECT id FROM organizations",
    "SELECT id FROM users -- tentativa de evasão",
    "SELECT 'UPDATE users SET name = 1'",
    "SELECT $$DELETE FROM users$$",
    "SELECT pg_terminate_backend($1)",
    "SELECT set_config($1, $2, false)",
    "SELECT dblink_exec($1)",
    "SELECT lo_unlink($1)",
  ];

  for (const sql of rejected) {
    assert.throws(() => assertReadOnlyQuery(sql), /somente leitura|SQL/i, sql);
  }
  assert.throws(
    () => assertReadOnlyQuery({ text: "SELECT id FROM users", values: [], name: "cached" }),
    /prepared|nomeada/i,
  );
});

test("withReadOnlyTransaction conecta, inicia READ ONLY e confirma somente queries validadas", async () => {
  const client = createFakeClient();

  const result = await withReadOnlyTransaction(client, async (transaction) => {
    assert.deepEqual(Object.keys(transaction), ["query"]);
    assert.equal(transaction.connect, undefined);
    assert.equal(transaction.end, undefined);
    assert.equal(transaction.release, undefined);
    await transaction.query("SELECT table_name FROM information_schema.tables");
    await transaction.query({ text: "SELECT id FROM users WHERE id = $1", values: ["id-1"] });
    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(client.connectCount, 1);
  assert.deepEqual(
    client.history.map((entry) => (typeof entry === "string" ? entry : entry.text)),
    [
      "BEGIN TRANSACTION READ ONLY",
      "SELECT table_name FROM information_schema.tables",
      "SELECT id FROM users WHERE id = $1",
      "COMMIT",
    ],
  );
  assert.equal(client.releaseCount, 1);
  assert.equal(client.endCount, 0);
});

test("withReadOnlyTransaction faz ROLLBACK e encerra Client quando o callback falha", async () => {
  const client = createFakeClient({ useRelease: false });

  await assert.rejects(
    withReadOnlyTransaction(client, async (transaction) => {
      await transaction.query("SELECT id FROM users");
      throw new Error("falha controlada");
    }),
    /falha controlada/,
  );

  assert.deepEqual(client.history, [
    "BEGIN TRANSACTION READ ONLY",
    "SELECT id FROM users",
    "ROLLBACK",
  ]);
  assert.equal(client.endCount, 1);
});

test("withReadOnlyTransaction bloqueia query fora da transação e finaliza após falha de conexão", async () => {
  const client = createFakeClient();
  let retainedTransaction;
  await withReadOnlyTransaction(client, async (transaction) => {
    retainedTransaction = transaction;
  });
  await assert.rejects(retainedTransaction.query("SELECT id FROM users"), /transação encerrada/i);

  const connectionFailure = createFakeClient({ connectError: new Error("offline") });
  await assert.rejects(
    withReadOnlyTransaction(connectionFailure, async () => {}),
    /offline/,
  );
  assert.deepEqual(connectionFailure.history, []);
  assert.equal(connectionFailure.releaseCount, 1);
});

test("createReadOnlyClient cria Client pg sem conectar e valida URL sem expor credencial", async () => {
  let receivedOptions;
  class FakePgClient {
    constructor(options) {
      receivedOptions = options;
    }
  }

  const databaseUrl = createDatabaseUrl("pg-readonly-fixture-password");
  const client = await createReadOnlyClient({
    databaseUrl,
    loadPgModule: async () => ({ Client: FakePgClient }),
  });

  assert.ok(client instanceof FakePgClient);
  assert.deepEqual(receivedOptions, { connectionString: databaseUrl });
  await assert.rejects(
    createReadOnlyClient({
      databaseUrl: createDatabaseUrl("invalid-protocol-password", "http:"),
      loadPgModule: async () => ({ Client: FakePgClient }),
    }),
    (error) => {
      assert.doesNotMatch(error.message, /invalid-protocol-password/);
      return /PostgreSQL/i.test(error.message);
    },
  );
});

function createFakeClient({ useRelease = true, connectError } = {}) {
  const client = {
    connectCount: 0,
    releaseCount: 0,
    endCount: 0,
    history: [],
    async connect() {
      this.connectCount += 1;
      if (connectError !== undefined) throw connectError;
    },
    async query(query, values) {
      this.history.push(values === undefined ? query : { text: query, values });
      return { rows: [], rowCount: 0 };
    },
    async end() {
      this.endCount += 1;
    },
  };
  if (useRelease) {
    client.release = () => {
      client.releaseCount += 1;
    };
  }
  return client;
}

function createDatabaseUrl(password, protocol = "postgresql:") {
  const url = new URL(`${protocol}//localhost:5432/giro`);
  url.username = "readonly";
  url.password = password;
  return url.toString();
}
