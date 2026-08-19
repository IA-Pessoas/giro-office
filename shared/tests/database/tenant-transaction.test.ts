import assert from "node:assert/strict";
import test from "node:test";

import { withTenantTransaction } from "../../src/database/tenant-transaction.js";

test("withTenantTransaction configura o tenant localmente antes da acao", async () => {
  const calls: string[] = [];
  const queries: Array<{ strings: readonly string[]; values: readonly unknown[] }> = [];
  let resolveSetConfig: (() => void) | undefined;
  const setConfig = new Promise<void>((resolve) => {
    resolveSetConfig = resolve;
  });
  const transaction = {
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<void> {
      calls.push("set-config");
      queries.push({ strings: [...strings], values });
      await setConfig;
    },
  };
  const client = {
    async $transaction<T>(action: (tx: typeof transaction) => Promise<T>): Promise<T> {
      calls.push("transaction");
      return await action(transaction);
    },
  };

  const result = withTenantTransaction(client, "org-1", async (tx) => {
    calls.push("action");
    assert.equal(tx, transaction);
    return "ok";
  });

  await Promise.resolve();
  assert.deepEqual(calls, ["transaction", "set-config"]);

  assert(resolveSetConfig);
  resolveSetConfig();

  assert.equal(await result, "ok");
  assert.deepEqual(calls, ["transaction", "set-config", "action"]);
  assert.deepEqual(queries, [
    {
      strings: ["SELECT set_config('app.organization_id', ", ", true)"],
      values: ["org-1"],
    },
  ]);
});
