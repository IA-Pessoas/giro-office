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

runTest("commercial catalog has a tenant-scoped CRUD contract and admin surface", () => {
  const contract = read("./services/commercialService.contract.ts");
  const service = read("./services/commercialService.ts");
  const hooks = read("./hooks/useCommercialProposalConfigs.ts");
  const catalog = read("./components/CommercialCatalog.tsx");
  const page = read("../../pages/comercial/index.tsx");

  assert.match(contract, /proposalConfigs:\s*["']\/commercial\/proposal-configs["']/);
  assert.match(contract, /proposalConfig: \(id: string\)/);
  assert.match(service, /listProposalConfigs/);
  assert.match(service, /createProposalConfig/);
  assert.match(service, /updateProposalConfig/);
  assert.match(hooks, /useMutation/);
  assert.match(catalog, /useModuleAccess\("comercial"\)/);
  assert.match(catalog, /Catálogo de propostas/);
  assert.match(catalog, /Valor base do contrato/);
  assert.match(page, /CommercialCatalog/);
});

runTest("commercial prospecting uses the dedicated legacy-status contract", () => {
  const contract = read("./services/commercialService.contract.ts");
  const service = read("./services/commercialService.ts");
  const hooks = read("./hooks/useCommercialProspecting.ts");
  const types = read("./types/index.ts");
  const catalog = read("./components/CommercialCatalog.tsx");

  assert.match(contract, /prospecting:\s*["']\/commercial\/prospecting["']/);
  assert.match(contract, /prospectingClients:\s*["']\/commercial\/prospecting\/clients["']/);
  assert.match(service, /listProspecting/);
  assert.match(service, /createProspecting/);
  assert.match(service, /updateProspecting/);
  assert.match(hooks, /invalidateQueries/);
  assert.match(types, /COMMERCIAL_PROSPECTING_STATUSES/);
  assert.match(catalog, /Nova prospecção/);
  assert.match(catalog, /COMMERCIAL_PROSPECTING_STATUSES/);
  assert.doesNotMatch(catalog, /client\/[^"']+\/commercial/);
});

runTest("commercial task billing exposes an authorized task outbox surface", () => {
  const contract = read("./services/commercialService.contract.ts");
  const service = read("./services/commercialService.ts");
  const hook = read("./hooks/useCommercialTaskBilling.ts");
  const types = read("./types/index.ts");
  const catalog = read("./components/CommercialCatalog.tsx");

  assert.match(contract, /taskBillings:\s*["']\/commercial\/task-billing["']/);
  assert.match(service, /listTaskBillings/);
  assert.match(service, /updateTaskBilling/);
  assert.match(hook, /useMutation/);
  assert.match(types, /COMMERCIAL_TASK_HIRING_STATUSES/);
  assert.match(catalog, /Cobrança de tarefas/);
  assert.match(catalog, /useModuleAccess\("comercial"\)/);
});

runTest("commercial catalog uses the shared dark text ramps", () => {
  const catalog = read("./components/CommercialCatalog.tsx");

  assert.doesNotMatch(catalog, /text-slate-950/);
  assert.doesNotMatch(catalog, /text-slate-600/);
  assert.match(catalog, /text-slate-900 dark:text-white/);
  assert.match(catalog, /text-slate-700 dark:text-slate-300/);
  assert.match(catalog, /placeholder:text-slate-400[^"]*dark:placeholder:text-slate-500/);
});

console.log("commercial contract tests passed");
