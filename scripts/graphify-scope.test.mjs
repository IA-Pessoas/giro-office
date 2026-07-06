import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  buildGraphifyCommand,
  buildGraphifyVisualizationCommand,
  loadGraphifyDotEnv,
} from "./graphify-scope.mjs";
import { isDirectScriptExecution } from "./graphify-scopes.mjs";

const tempDirs = [];

function createTempWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), "graphify-env-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("buildGraphifyCommand", () => {
  it("builds the frontend extraction command", () => {
    assert.deepEqual(buildGraphifyCommand("ui", "extract"), {
      command: "graphify",
      args: ["extract", "app", "--out", "app"],
      env: {},
    });
  });

  it("builds the services update command with scoped output", () => {
    assert.deepEqual(buildGraphifyCommand("services", "update"), {
      command: "graphify",
      args: ["update", "services"],
      env: { GRAPHIFY_OUT: resolve("services/graphify-out") },
    });
  });

  it("rejects invalid scopes", () => {
    assert.throws(() => buildGraphifyCommand("all", "extract"), /Escopo invalido/);
  });
});

describe("buildGraphifyVisualizationCommand", () => {
  it("builds the services graph.html generation command", () => {
    assert.deepEqual(buildGraphifyVisualizationCommand("services"), {
      command: "graphify",
      args: ["cluster-only", "services", "--graph", "services/graphify-out/graph.json"],
      env: {},
    });
  });
});

describe("loadGraphifyDotEnv", () => {
  it("loads OpenAI key from .env without overriding an existing environment value", () => {
    const cwd = createTempWorkspace();
    writeFileSync(
      join(cwd, ".env"),
      [
        "OPENAI_API_KEY=from-file",
        'ANTHROPIC_API_KEY="quoted value"',
        "IGNORED_SERVICE_SECRET=not-needed",
        "",
      ].join("\n"),
    );

    const env = loadGraphifyDotEnv({
      cwd,
      baseEnv: {
        OPENAI_API_KEY: "from-shell",
      },
    });

    assert.equal(env.OPENAI_API_KEY, "from-shell");
    assert.equal(env.ANTHROPIC_API_KEY, "quoted value");
    assert.equal(env.IGNORED_SERVICE_SECRET, undefined);
  });
});

describe("isDirectScriptExecution", () => {
  it("matches POSIX file URLs against POSIX argv paths", () => {
    assert.equal(
      isDirectScriptExecution(
        "file:///repo/scripts/graphify-context.mjs",
        "/repo/scripts/graphify-context.mjs",
      ),
      true,
    );
  });

  it("matches Windows file URLs against Windows argv paths", () => {
    assert.equal(
      isDirectScriptExecution(
        "file:///C:/repo/scripts/graphify-postprocess.mjs",
        "C:\\repo\\scripts\\graphify-postprocess.mjs",
      ),
      true,
    );
  });

  it("does not match a missing argv path", () => {
    assert.equal(
      isDirectScriptExecution("file:///repo/scripts/graphify-context.mjs", undefined),
      false,
    );
  });
});
