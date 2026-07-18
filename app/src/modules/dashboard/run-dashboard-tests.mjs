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

await runTest("dashboard page renders real dashboard module instead of static layout mock", async () => {
  const pageSource = await readAppSource("pages/dashboard/index.tsx");

  assert.match(pageSource, /useDashboard\(/);
  assert.match(pageSource, /<DashboardGrid\s+stats=/);
  assert.doesNotMatch(pageSource, /shared\/components\/newLayout\/Dashboard/);
});

await runTest("dashboard service does not fallback to mock stats", async () => {
  const serviceSource = await readAppSource("modules/dashboard/services/dashboardService.ts");

  assert.match(serviceSource, /api\.get\(["']\/dashboard\/stats["']\)/);
  assert.doesNotMatch(serviceSource, /getMockStats/);
  assert.doesNotMatch(serviceSource, /using mock data/i);
});
