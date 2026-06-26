import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildGraphifyContext, tokenizeTask } from "./graphify-context.mjs";

const tempDirs = [];
const scriptPath = fileURLToPath(new URL("./graphify-context.mjs", import.meta.url));

function createTempWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), "graphify-context-"));
  tempDirs.push(dir);
  return dir;
}

async function writeJson(path, value) {
  await mkdir(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

async function writeServicesGraph(cwd) {
  await mkdir(join(cwd, "services/graphify-out"), { recursive: true });
  await writeJson(join(cwd, "services/graphify-out/graph.json"), {
    nodes: [
      {
        id: "user_routes",
        label: "RequireAdminUserAuth",
        source_file: "user-service/src/routes/user.routes.ts",
        community: 1,
      },
      {
        id: "user_test",
        label: "user routes test",
        source_file: "user-service/src/test/user.routes.test.ts",
        community: 1,
      },
      {
        id: "rh_request",
        label: "RequestService",
        source_file: "rh-service/src/services/requestService.ts",
        community: 2,
      },
    ],
    links: [
      {
        source: "user_routes",
        target: "user_test",
        relation: "tested-by",
        source_file: "user-service/src/routes/user.routes.ts",
      },
      {
        source: "rh_request",
        target: "user_routes",
        relation: "uses",
        source_file: "rh-service/src/services/requestService.ts",
      },
    ],
    built_at_commit: "abc123",
  });
  await writeJson(join(cwd, "services/graphify-out/.graphify_labels.json"), {
    1: "User Service routes: User Routes",
    2: "RH Service services: Request Service",
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("buildGraphifyContext", () => {
  it("normalizes Portuguese task text into useful search tokens", () => {
    const tokens = tokenizeTask("Alterar permissão dos usuários no RH");

    assert.ok(tokens.includes("permissao"));
    assert.ok(tokens.includes("permission"));
    assert.ok(tokens.includes("usuarios"));
    assert.ok(tokens.includes("user"));
    assert.ok(tokens.includes("rh"));
  });

  it("ranks communities and files using graph.links", async () => {
    const cwd = createTempWorkspace();
    await writeServicesGraph(cwd);

    const output = buildGraphifyContext("services", "ajustar permissao user routes", { cwd });

    assert.match(output, /User Service routes: User Routes/);
    assert.match(output, /services\/user-service\/src\/routes\/user\.routes\.ts/);
    assert.match(output, /services\/user-service\/src\/test\/user\.routes\.test\.ts/);
    assert.doesNotMatch(output, /edges/i);
  });

  it("limits candidate files to twelve", async () => {
    const cwd = createTempWorkspace();
    await mkdir(join(cwd, "app/graphify-out"), { recursive: true });
    await writeJson(join(cwd, "app/graphify-out/graph.json"), {
      nodes: Array.from({ length: 20 }, (_, index) => ({
        id: `client_${index}`,
        label: `Client ${index}`,
        source_file: `src/modules/clients/components/Client${index}.tsx`,
        community: 1,
      })),
      links: [],
    });

    const output = buildGraphifyContext("ui", "client", { cwd });
    const candidateSection = output
      .split("## Arquivos candidatos")[1]
      .split("## Testes relacionados")[0];
    const candidateCount = candidateSection
      .split("\n")
      .filter((line) => line.startsWith("- ")).length;

    assert.equal(candidateCount, 12);
  });

  it("exits with code 2 when the graph is missing", () => {
    const cwd = createTempWorkspace();
    const result = spawnSync(process.execPath, [scriptPath, "ui", "qualquer task"], {
      cwd,
      encoding: "utf8",
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Graphify indisponivel ou sem grafo local/);
  });
});
