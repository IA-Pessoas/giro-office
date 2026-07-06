import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  determineRefreshScopes,
  selectScopesFromPaths,
  selectStaleScopes,
} from "./graphify-refresh.mjs";

const tempDirs = [];

function createTempWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), "graphify-refresh-"));
  tempDirs.push(dir);
  return dir;
}

async function writeGraph(cwd, graphPath, commit) {
  await mkdir(join(cwd, graphPath, ".."), { recursive: true });
  writeFileSync(
    join(cwd, graphPath),
    JSON.stringify({ nodes: [], links: [], built_at_commit: commit }, null, 2),
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("graphify refresh scope selection", () => {
  it("selects ui and services from changed paths", () => {
    assert.deepEqual(
      selectScopesFromPaths(["app/src/pages/home/index.tsx", "services/rh-service/src/app.ts"]),
      ["services", "ui"],
    );
  });

  it("uses explicit scope before changed paths", async () => {
    const cwd = createTempWorkspace();
    assert.deepEqual(
      determineRefreshScopes({
        explicitScope: "ui",
        changedPaths: ["services/rh-service/src/app.ts"],
        currentCommit: "new",
        cwd,
      }),
      ["ui"],
    );
  });

  it("selects stale graphs when no scoped paths changed", async () => {
    const cwd = createTempWorkspace();
    await writeGraph(cwd, "app/graphify-out/graph.json", "old");
    await writeGraph(cwd, "services/graphify-out/graph.json", "new");

    assert.deepEqual(selectStaleScopes("new", { cwd }), ["ui"]);
    assert.deepEqual(
      determineRefreshScopes({ changedPaths: ["package.json"], currentCommit: "new", cwd }),
      ["ui"],
    );
  });
});
