import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seedSource = await readFile(new URL("../infra/prisma/seed.ts", import.meta.url), "utf8");

test("o seed de Integração usa UUIDs válidos para clientes e projetos", () => {
  assert.doesNotMatch(seedSource, /id:\s*"client-\d+"/);
  assert.doesNotMatch(seedSource, /id:\s*"proj-\d+"/);
});

test("o seed de projetos é determinístico para QA repetível", () => {
  assert.doesNotMatch(seedSource, /Math\.random\(\)/);
});
