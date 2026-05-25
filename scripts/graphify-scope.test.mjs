import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { buildGraphifyCommand } from "./graphify-scope.mjs";

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
