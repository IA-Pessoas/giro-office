import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { buildGraphifyEnv, parseDotenvContent } from "./graphify-env.mjs";

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

describe("parseDotenvContent", () => {
  it("parses Gemini keys from dotenv syntax without exposing comments", () => {
    assert.deepEqual(
      parseDotenvContent(`
        # local graphify key
        export GEMINI_API_KEY="gemini-local"
        GOOGLE_API_KEY='google-local'
      `),
      {
        GEMINI_API_KEY: "gemini-local",
        GOOGLE_API_KEY: "google-local",
      },
    );
  });
});

describe("buildGraphifyEnv", () => {
  it("loads GEMINI_API_KEY from root .env.local for Graphify child processes", async () => {
    const cwd = createTempWorkspace();
    await mkdir(join(cwd, "app"), { recursive: true });
    writeFileSync(join(cwd, ".env.local"), "GEMINI_API_KEY=from-root\n");

    const result = buildGraphifyEnv("ui", { cwd, baseEnv: {} });

    assert.equal(result.env.GEMINI_API_KEY, "from-root");
    assert.deepEqual(result.loadedFiles, [".env.local"]);
    assert.equal(result.hasGeminiKey, true);
  });

  it("keeps explicit process env values ahead of dotenv files", async () => {
    const cwd = createTempWorkspace();
    await mkdir(join(cwd, "app"), { recursive: true });
    writeFileSync(join(cwd, ".env.local"), "GEMINI_API_KEY=from-file\n");

    const result = buildGraphifyEnv("ui", {
      cwd,
      baseEnv: { GEMINI_API_KEY: "from-shell" },
    });

    assert.equal(result.env.GEMINI_API_KEY, "from-shell");
    assert.equal(result.hasGeminiKey, true);
  });

  it("loads scope-specific env files after root env files", async () => {
    const cwd = createTempWorkspace();
    await mkdir(join(cwd, "app"), { recursive: true });
    writeFileSync(join(cwd, ".env"), "GOOGLE_API_KEY=from-root\n");
    writeFileSync(join(cwd, "app/.env.local"), "GOOGLE_API_KEY=from-app\n");

    const result = buildGraphifyEnv("ui", { cwd, baseEnv: {} });

    assert.equal(result.env.GOOGLE_API_KEY, "from-app");
    assert.deepEqual(result.loadedFiles, [".env", "app/.env.local"]);
    assert.equal(result.hasGeminiKey, true);
  });
});
