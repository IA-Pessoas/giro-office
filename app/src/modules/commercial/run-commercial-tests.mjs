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

runTest("commercial dashboard uses the public commercial surface", () => {
  const component = read("./components/CommercialCatalog.tsx");
  const contract = read("./services/commercialService.contract.ts");
  const service = read("./services/commercialService.ts");

  assert.match(component, /CommercialCatalog/);
  assert.doesNotMatch(component, /client\/commercial/);
  assert.doesNotMatch(contract, /client\/commercial/);
  assert.doesNotMatch(service, /getOverview|COMMERCIAL_ENDPOINTS\.overview/);
});

runTest("commercial dashboard no longer embeds primary mock datasets", () => {
  const component = read("./components/CommercialCatalog.tsx");

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
  const browserSmoke = read("./run-commercial-browser-smoke.mjs");
  const page = read("../../pages/comercial/index.tsx");

  assert.match(contract, /proposalConfigs:\s*["']\/commercial\/proposal-configs["']/);
  assert.match(contract, /proposalConfig: \(id: string\)/);
  assert.match(service, /listProposalConfigs/);
  assert.match(service, /createProposalConfig/);
  assert.match(service, /updateProposalConfig/);
  assert.match(service, /deleteProposalConfig/);
  assert.match(hooks, /useMutation/);
  assert.match(hooks, /useDeleteCommercialProposalConfig/);
  assert.match(catalog, /useModuleAccess\("comercial"\)/);
  assert.match(catalog, /Catálogo de propostas/);
  assert.match(catalog, /Valor base do contrato/);
  assert.match(catalog, /Excluir configuração/);
  assert.doesNotMatch(catalog, /window\.confirm/);
  assert.match(browserSmoke, /request\.method === "DELETE"/);
  assert.match(browserSmoke, /02-commercial-config-deleted\.png/);
  assert.match(browserSmoke, /05-commercial-prospecting-archived\.png/);
  assert.match(page, /CommercialCatalog/);
});

runTest("commercial prospecting uses the dedicated legacy-status contract", () => {
  const contract = read("./services/commercialService.contract.ts");
  const service = read("./services/commercialService.ts");
  const hooks = read("./hooks/useCommercialProspecting.ts");
  const types = read("./types/index.ts");
  const catalog = read("./components/CommercialCatalog.tsx");

  assert.match(contract, /prospecting:\s*["']\/commercial\/prospecting["']/);
  assert.match(service, /listProspecting/);
  assert.match(service, /createProspecting/);
  assert.match(service, /updateProspecting/);
  assert.match(service, /archiveProspecting/);
  assert.match(hooks, /invalidateQueries/);
  assert.match(hooks, /useArchiveCommercialProspecting/);
  assert.match(types, /COMMERCIAL_PROSPECTING_STATUSES/);
  assert.match(catalog, /Nova prospecção/);
  assert.match(catalog, /COMMERCIAL_PROSPECTING_STATUSES/);
  assert.match(catalog, /Arquivar prospecção/);
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

runTest("commercial prospecting picks the client with the shared searchable picker", () => {
  const catalog = read("./components/CommercialCatalog.tsx");
  const hooks = read("./hooks/useCommercialProspecting.ts");

  assert.match(catalog, /import \{ ClientPickerModal, type ClientPickerOption \} from "@modules\/clients"/);
  assert.match(catalog, /<ClientPickerModal[\s\S]*onSelectClient=/);
  assert.doesNotMatch(catalog, /Selecione um cliente<\/option>/);
  assert.doesNotMatch(hooks, /useCommercialProspectingClients/);
});

runTest("commercial shows client names with the app rule (razão social, then nome)", () => {
  const catalog = read("./components/CommercialCatalog.tsx");

  assert.match(catalog, /function getClientDisplayName\(client: \{ name: string; company_name: string \| null \}\)[\s\S]*client\.company_name \|\| client\.name/);
  assert.doesNotMatch(catalog, /fantasy_name/);
});

runTest("commercial confirmations use the shared dialog and saves show a toast", () => {
  const catalog = read("./components/CommercialCatalog.tsx");

  assert.match(catalog, /<ConfirmationDialog/);
  assert.doesNotMatch(catalog, /window\.confirm/);
  assert.match(catalog, /toast\.success\("Cobrança salva\."\)/);
});

runTest("commercial payment field says what to write", () => {
  const catalog = read("./components/CommercialCatalog.tsx");

  assert.match(catalog, /Forma de pagamento/);
  assert.match(catalog, /placeholder="Ex\.: À vista, 3x no boleto, pago em 10\/09"/);
});

runTest("commercial copy has no technical jargon and uses the module width", () => {
  const catalog = read("./components/CommercialCatalog.tsx");

  assert.doesNotMatch(catalog, /legados|auditável|por evento/);
  assert.doesNotMatch(catalog, /max-w-\[1200px\]/);
  assert.match(catalog, /max-w-\[1600px\]/);
});

runTest("commercial catalog uses the shared dark text ramps", () => {
  const catalog = read("./components/CommercialCatalog.tsx");

  assert.doesNotMatch(catalog, /text-slate-950/);
  assert.doesNotMatch(catalog, /text-slate-600/);
  assert.match(catalog, /text-slate-900 dark:text-white/);
  assert.match(catalog, /text-slate-700 dark:text-slate-300/);
  assert.match(catalog, /placeholder:text-slate-400[^"]*dark:placeholder:text-slate-500/);
});

runTest("commercial contract value uses the shared Brazilian currency mask", () => {
  const catalog = read("./components/CommercialCatalog.tsx");

  assert.match(catalog, /formatBrlInput/);
  assert.match(catalog, /normalizeDigits\(event\.target\.value\)/);
  assert.match(catalog, /parseBrlInput/);
  assert.match(catalog, /Math\.round\(value \* 100\)/);
});

runTest("commercial creation actions open the shared dialogs", () => {
  const catalog = read("./components/CommercialCatalog.tsx");

  assert.match(catalog, /import \{ ConfirmationDialog, Dialog \} from "@shared\/components";/);
  assert.match(catalog, /<Dialog[\s\S]*open=\{isCreating\}[\s\S]*title="Nova configuração"/);
  assert.match(catalog, /<Dialog[\s\S]*open=\{isCreatingProspecting\}[\s\S]*title="Nova prospecção"/);
  assert.match(catalog, /onCloseAutoFocus=/);
  assert.match(catalog, /disabled=\{isSaving\}/);
  assert.match(catalog, /disabled=\{isSavingProspecting\}/);
  assert.match(catalog, /isSaving \? "Salvando\.\.\."/);
  assert.match(catalog, /isSavingProspecting \? <Loader2/);
  assert.match(catalog, /editingId !== null/);
  assert.match(catalog, /prospectingEditingId !== null/);
  assert.doesNotMatch(catalog, /\{isCreating \|\| editingId !== null \?/);
  assert.doesNotMatch(catalog, /prospectingEditingId !== null \|\| \(!prospectingQuery\.data\?\.length/);
});

runTest("commercial browser smoke starts Next on the current platform", () => {
  const browserSmoke = read("./run-commercial-browser-smoke.mjs");

  assert.match(browserSmoke, /process\.platform === "win32"/);
  assert.match(browserSmoke, /corepack/, "o smoke deve manter o gerenciador de pacotes fixado");
  assert.doesNotMatch(browserSmoke, /spawn\("cmd", \["\/c", "corepack"/);
  assert.match(browserSmoke, /async function stopProcessTree/);
  assert.match(browserSmoke, /await stopProcessTree\(serverProcess\)/);
});
console.log("commercial contract tests passed");
