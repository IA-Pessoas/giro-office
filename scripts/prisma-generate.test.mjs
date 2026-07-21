import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadEnvFile } from "./prisma-generate.mjs";

test("loadEnvFile loads missing values without overriding existing env", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "prisma-generate-env-"));
  const envPath = path.join(dir, ".env");
  const env = {
    DATABASE_URL: "postgresql://shell.example/db",
  };

  await writeFile(
    envPath,
    [
      "# local development env",
      'DATABASE_URL="postgresql://file.example/db"',
      "JWT_SECRET=file-secret",
      "SPACED_VALUE='trimmed value'",
      "",
    ].join("\n"),
  );

  loadEnvFile(envPath, env);

  assert.equal(env.DATABASE_URL, "postgresql://shell.example/db");
  assert.equal(env.JWT_SECRET, "file-secret");
  assert.equal(env.SPACED_VALUE, "trimmed value");
});
