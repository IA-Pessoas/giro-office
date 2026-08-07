import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = join(here, "../..");

function read(rel) {
  return readFileSync(join(appSrc, rel), "utf8");
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

runTest("LazyRecharts per-primitive wrapper must not exist", () => {
  assert.equal(
    existsSync(join(appSrc, "shared/components/charts/LazyRecharts.tsx")),
    false,
  );
});

runTest("dashboard page lazy-loads the full Dashboard component", () => {
  const src = read("pages/dashboard/index.tsx");
  assert.match(src, /next\/dynamic/);
  assert.match(src, /ssr:\s*false/);
  assert.match(src, /newLayout\/Dashboard/);
  assert.doesNotMatch(
    src,
    /import\s+\{\s*Dashboard\s+as\s+DashboardContent\s*\}\s+from/,
  );
});

runTest("DashboardGrid lazy-loads chart components as wholes", () => {
  const src = read("modules/dashboard/components/DashboardGrid.tsx");
  assert.match(src, /next\/dynamic/);
  assert.match(src, /FiscalObligationsChart/);
  assert.match(src, /ServiceDistributionChart/);
  assert.match(src, /ClientTrendsChart/);
  assert.match(src, /ssr:\s*false/);
  assert.doesNotMatch(
    src,
    /import\s+\{\s*ClientTrendsChart\s*\}\s+from\s+["']\.\/ClientTrendsChart["']/,
  );
});

const chartLeaves = [
  "modules/dashboard/components/ServiceDistributionChart.tsx",
  "modules/dashboard/components/FiscalObligationsChart.tsx",
  "modules/dashboard/components/ClientTrendsChart.tsx",
  "shared/components/newLayout/Dashboard.tsx",
];

for (const rel of chartLeaves) {
  runTest(`${rel} keeps static recharts imports for composition`, () => {
    const src = read(rel);
    assert.match(src, /from\s+["']recharts["']/);
    assert.doesNotMatch(src, /LazyRecharts/);
  });
}

console.log("All recharts lazy tests passed.");
