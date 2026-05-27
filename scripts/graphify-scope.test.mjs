import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { buildGraphifyCommand } from "./graphify-scope.mjs";
import { isDirectScriptExecution } from "./graphify-scopes.mjs";

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
