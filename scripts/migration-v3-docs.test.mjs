import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("documenta que rh.requests.requester_user_id vem do colaborador legado", async () => {
  const doc = await readFile("docs/migration/v3/rh-pessoal-dry-run.md", "utf8");

  assert.match(doc, /rh\.requests\.requester_user_id/);
  assert.match(doc, /maps\.collaboratorByLegacy\.get\(String\(row\.requerente\)\)/);
  assert.doesNotMatch(
    doc,
    /const requesterId = maps\.adminUserByLegacy\.get\(String\(row\.requerente\)\)/,
  );
});
