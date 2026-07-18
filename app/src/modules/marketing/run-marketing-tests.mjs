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

await runTest("marketing page renders real marketing module instead of static layout mock", async () => {
  const pageSource = await readAppSource("pages/marketing/index.tsx");

  assert.match(pageSource, /useMarketingDashboard\(/);
  assert.match(pageSource, /<MarketingDashboard\s+stats=/);
  assert.doesNotMatch(pageSource, /shared\/components\/newLayout\/Marketing/);
});

await runTest("marketing service calls the consolidated real stats endpoint", async () => {
  const serviceSource = await readAppSource("modules/marketing/services/marketingService.ts");

  assert.match(serviceSource, /api\.get\(["']\/dashboard\/marketing\/stats["']\)/);
  assert.doesNotMatch(serviceSource, /mock/i);
  assert.doesNotMatch(serviceSource, /Páscoa Corporativa|Chocolates Premium|monthlySpending/);
});
