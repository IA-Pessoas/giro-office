import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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

const newLayoutTargets = [
  "shared/components/newLayout/Dashboard.tsx",
  "shared/components/newLayout/Parcelamento.tsx",
  "shared/components/newLayout/Tecnologia.tsx",
  "shared/components/newLayout/Regularize.tsx",
  "shared/components/newLayout/Commercial.tsx",
  "shared/components/newLayout/Marketing.tsx",
  "shared/components/newLayout/Fiscal.tsx",
  "shared/components/newLayout/DepartamentoPessoal.tsx",
];

const moduleChartTargets = [
  "modules/dashboard/components/ServiceDistributionChart.tsx",
  "modules/dashboard/components/FiscalObligationsChart.tsx",
  "modules/dashboard/components/ClientTrendsChart.tsx",
];

const staticRecharts = /from\s+['"]recharts['"]/;

runTest("LazyRecharts module exists", () => {
  assert.equal(
    existsSync(join(appSrc, "shared/components/charts/LazyRecharts.tsx")),
    true,
  );
});

runTest("LazyRecharts uses next/dynamic and does not statically re-export for consumers incorrectly", () => {
  const src = read("shared/components/charts/LazyRecharts.tsx");
  assert.match(src, /next\/dynamic/);
  assert.match(src, /import\(["']recharts["']\)/);
  assert.match(src, /ssr:\s*false/);
});

for (const rel of [...newLayoutTargets, ...moduleChartTargets]) {
  runTest(`${rel} does not statically import recharts`, () => {
    const src = read(rel);
    assert.doesNotMatch(src, staticRecharts);
    assert.match(src, /LazyRecharts|shared\/components\/charts\/LazyRecharts/);
  });
}

console.log("All recharts lazy tests passed.");
