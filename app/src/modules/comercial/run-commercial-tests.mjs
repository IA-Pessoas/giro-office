import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "../..");

async function readAppSource(relativePath) {
  return await readFile(resolve(appRoot, relativePath), "utf8");
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await runTest("commercial page renders real commercial module instead of static layout mock", async () => {
  const pageSource = await readAppSource("pages/comercial/index.tsx");

  assert.match(pageSource, /useCommercialDashboard\(/);
  assert.match(pageSource, /<CommercialDashboard\s+stats=/);
  assert.doesNotMatch(pageSource, /shared\/components\/newLayout\/Commercial/);
});

await runTest("commercial service calls the consolidated real stats endpoint", async () => {
  const serviceSource = await readAppSource("modules/comercial/services/comercialService.ts");

  assert.match(serviceSource, /api\.get\(["']\/dashboard\/commercial\/stats["']\)/);
  assert.doesNotMatch(serviceSource, /mock/i);
  assert.doesNotMatch(serviceSource, /João Silva|Tech Solutions|monthlyConversions/);
});
