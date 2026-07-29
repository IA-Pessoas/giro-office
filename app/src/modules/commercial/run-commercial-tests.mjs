import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function runTest(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("commercial dashboard consumes real overview endpoint", () => {
  const component = read("../../shared/components/newLayout/Commercial.tsx");
  const contract = read("./services/commercialService.contract.ts");
  const service = read("./services/commercialService.ts");
  const hook = read("./hooks/useCommercialOverview.ts");

  assert.match(component, /useCommercialOverview\(/);
  assert.match(contract, /overview:\s*["']\/client\/commercial\/overview["']/);
  assert.match(service, /api\.get<.*>\(\s*COMMERCIAL_ENDPOINTS\.overview/s);
  assert.match(hook, /commercialService\.getOverview\(\)/);
});

runTest("commercial dashboard no longer embeds primary mock datasets", () => {
  const component = read("../../shared/components/newLayout/Commercial.tsx");

  assert.doesNotMatch(component, /const\s+leads\s*:\s*Lead\[\]\s*=\s*\[/);
  assert.doesNotMatch(component, /const\s+proposals\s*:\s*Proposal\[\]\s*=\s*\[/);
  assert.doesNotMatch(component, /const\s+contracts\s*:\s*Contract\[\]\s*=\s*\[/);
  assert.doesNotMatch(component, /const\s+monthlyConversions\s*=\s*\[/);
});

console.log("commercial contract tests passed");
