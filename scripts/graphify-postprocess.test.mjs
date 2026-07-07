import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { writeGraphifyPostprocess } from "./graphify-postprocess.mjs";

const tempDirs = [];

function createTempWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), "graphify-postprocess-"));
  tempDirs.push(dir);
  return dir;
}

async function writeJson(path, value) {
  await mkdir(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function fixtureGraph() {
  return {
    nodes: [
      {
        id: "user_routes",
        label: "user.routes.ts",
        source_file: "user-service/src/routes/user.routes.ts",
        community: 1,
      },
      {
        id: "user_schema",
        label: "UserPermissionSchema",
        source_file: "user-service/src/schemas/user.schemas.ts",
        community: 1,
      },
      {
        id: "rh_service",
        label: "requestService",
        source_file: "rh-service/src/services/requestService.ts",
        community: 2,
      },
    ],
    links: [
      {
        source: "user_routes",
        target: "user_schema",
        relation: "imports",
        source_file: "user-service/src/routes/user.routes.ts",
      },
      {
        source: "rh_service",
        target: "user_schema",
        relation: "uses",
        source_file: "rh-service/src/services/requestService.ts",
      },
    ],
    built_at_commit: "abc123",
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("writeGraphifyPostprocess", () => {
  it("generates AGENT_BRIEF.md and FILE_MAP.md from graph nodes and links", async () => {
    const cwd = createTempWorkspace();
    await mkdir(join(cwd, "services/graphify-out"), { recursive: true });
    await writeJson(join(cwd, "services/graphify-out/graph.json"), fixtureGraph());
    await writeJson(join(cwd, "services/graphify-out/.graphify_labels.json"), {
      1: "User Service routes: User Routes",
      2: "RH Service services: Request Service",
    });

    const result = writeGraphifyPostprocess("services", { cwd });
    const brief = readFileSync(result.briefPath, "utf8");
    const fileMap = readFileSync(result.fileMapPath, "utf8");

    assert.match(brief, /Agent Brief - Services/);
    assert.match(brief, /Links: 2/);
    assert.match(brief, /User Service routes: User Routes/);
    assert.match(brief, /pnpm graphify:context:services/);
    assert.match(fileMap, /user-service routes/);
    assert.match(fileMap, /services\/user-service\/src\/routes\/user\.routes\.ts/);
  });

  it("uses deterministic labels when label metadata is missing", async () => {
    const cwd = createTempWorkspace();
    await mkdir(join(cwd, "app/graphify-out"), { recursive: true });
    await writeJson(join(cwd, "app/graphify-out/graph.json"), {
      nodes: [
        {
          id: "rh_component",
          label: "RhRequestPanel",
          source_file: "src/modules/rh/components/RhRequestPanel.tsx",
          community: 9,
        },
      ],
      links: [],
      built_at_commit: "def456",
    });

    const result = writeGraphifyPostprocess("ui", { cwd });
    const brief = readFileSync(result.briefPath, "utf8");
    const fileMap = readFileSync(result.fileMapPath, "utf8");

    assert.match(brief, /Frontend: src modules rh/);
    assert.match(fileMap, /modules\/rh components/);
  });
});
