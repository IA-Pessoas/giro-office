import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const moduleUrl = new URL("./", import.meta.url);
const moduleRoot =
  moduleUrl.pathname.startsWith("/") && /^[A-Za-z]:/.test(moduleUrl.pathname.slice(1))
    ? moduleUrl.pathname.slice(1)
    : moduleUrl.pathname;
const appRoot = join(moduleRoot, "../../..");
const moduleRootRelative = "src/modules/ti";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function readModuleSource(relativePath) {
  return readFile(join(moduleRoot, relativePath), "utf8");
}

async function readAppSource(relativePath) {
  return readFile(join(appRoot, relativePath), "utf8");
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
      continue;
    }

    if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

await runTest("ti endpoints stay centralized in the frontend contract", async () => {
  const contractSource = await readModuleSource("services/tiService.contract.ts");

  for (const endpoint of [
    "/ti/inventory/list",
    "/ti/inventory",
    "/ti/inventory/{id}",
    "/ti/inventory/{id}/assign-user",
    "/ti/inventory/{id}/return",
    "/ti/inventory-categories/list",
    "/ti/inventory-categories",
    "/ti/inventory-categories/{id}",
    "/ti/inventory-locations/list",
    "/ti/inventory-locations",
    "/ti/inventory-locations/{id}",
    "/ti/requests/list",
    "/ti/requests",
    "/ti/requests/{id}",
    "/ti/requests/{id}/assign",
    "/ti/requests/{id}/status",
    "/ti/requests/{id}/messages",
    "/ti/request-categories/list",
    "/ti/request-categories",
    "/ti/request-categories/{id}",
    "/ti/passwords/list",
    "/ti/passwords",
    "/ti/passwords/{id}",
    "/ti/extensions/list",
    "/ti/extensions",
    "/ti/extensions/{id}",
    "/ti/terms/list",
    "/ti/terms",
    "/ti/terms/{id}",
    "/ti/terms/{id}/sign",
    "/ti/stock/items/list",
    "/ti/stock/items",
    "/ti/stock/items/{id}",
    "/ti/stock/items/{id}/entries",
    "/ti/stock/items/{id}/exits",
    "/ti/stock/categories/list",
    "/ti/stock/categories",
    "/ti/stock/categories/{id}",
    "/ti/stock/locations/list",
    "/ti/stock/locations",
    "/ti/stock/locations/{id}",
    "/ti/robots/list",
    "/ti/robots",
    "/ti/robots/{id}",
    "/ti/robots/{id}/runs",
    "/ti/robots/{id}/runs/list",
    "/ti/dashboard",
  ]) {
    assert.match(contractSource, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
});

await runTest("tecnologia page renders the ti module instead of legacy mock layout", async () => {
  const pageSource = await readAppSource("src/pages/tecnologia/index.tsx");

  assert.match(pageSource, /@modules\/ti/);
  assert.match(pageSource, /<TiPage\s*\/>/);
  assert.doesNotMatch(pageSource, /shared\/components\/newLayout\/Tecnologia/);
  assert.doesNotMatch(pageSource, /<Tecnologia\s*\/>/);
});

await runTest("ti api client usage stays inside ti services", async () => {
  const files = await collectSourceFiles(moduleRoot);
  const offenders = [];

  for (const file of files) {
    const relativePath = relative(appRoot, file).replaceAll("\\", "/");

    if (relativePath.startsWith(`${moduleRootRelative}/services/`)) {
      continue;
    }

    const source = await readFile(file, "utf8");

    if (
      source.includes("@shared/services/apiClient") ||
      source.includes("@shared/services/api") ||
      /api\.(get|post|patch|put|delete)\(/.test(source)
    ) {
      offenders.push(relativePath);
    }
  }

  assert.deepEqual(offenders, []);
});

await runTest("ti hooks use domain query keys and the shared fetch hook", async () => {
  for (const hookPath of [
    "hooks/useTiDashboard.ts",
    "hooks/useTiRequests.ts",
    "hooks/useTiRobots.ts",
    "hooks/useTiInventory.ts",
    "hooks/useTiTerms.ts",
    "hooks/useTiStock.ts",
    "hooks/useTiPasswords.ts",
    "hooks/useTiExtensions.ts",
  ]) {
    const source = await readModuleSource(hookPath);

    assert.match(source, /tiQueryKeys/);
    assert.match(source, /useFetch/);
  }
});

await runTest("ti page remains a shell without embedded primary mock datasets", async () => {
  const pageSource = await readModuleSource("components/TiPage.tsx");

  assert.match(pageSource, /useModuleAccess\("ti"\)/);
  assert.doesNotMatch(
    pageSource,
    /const\s+(requests|robots|inventory|stockItems|terms|passwords|extensions)\s*=/,
  );
  assert.doesNotMatch(pageSource, /api\.(get|post|patch|put|delete)\(/);
});

await runTest("ti visible copy stays product-facing and avoids implementation handoff terms", async () => {
  const files = await collectSourceFiles(join(moduleRoot, "components"));
  const offenders = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");

    if (/(endpoint|\/ti\/|PR de|fundacao|hooks e services|sem dados artificiais)/i.test(source)) {
      offenders.push(relative(appRoot, file).replaceAll("\\", "/"));
    }
  }

  assert.deepEqual(offenders, []);
});

await runTest("ti shell follows the existing regularize-style page and tab pattern", async () => {
  const pageSource = await readModuleSource("components/TiPage.tsx");
  const workspaceUiSource = await readModuleSource("components/tiWorkspaceUi.ts");

  assert.match(workspaceUiSource, /max-w-\[1600px\]/);
  assert.match(pageSource, /role="tablist"/);
  assert.match(pageSource, /aria-selected=\{isActive\}/);
  assert.doesNotMatch(pageSource, /Modulo TI/);
  assert.doesNotMatch(pageSource, /Edicao liberada/);
  assert.doesNotMatch(pageSource, /description:\s*"/);
  assert.doesNotMatch(pageSource, /grid-cols-2.*xl:grid-cols-8/);
  assert.match(pageSource, /overflow-x-auto/);
  assert.match(pageSource, /scrollbar-width:thin/);
  assert.match(pageSource, /scrollbar-thumb.*blue-600/);
  assert.match(pageSource, /flex min-w-max items-center justify-center gap-1 pl-7 md:min-w-full/);
  assert.match(pageSource, /px-4 py-2\.5/);
  assert.doesNotMatch(pageSource, /md:flex-1/);
  assert.match(pageSource, /shrink-0 items-center justify-center/);
  assert.doesNotMatch(pageSource, /truncate/);
  assert.match(pageSource, /from-blue-500 to-blue-600/);
  assert.match(pageSource, /bg-blue-100 text-blue-700/);
  assert.doesNotMatch(`${pageSource}\n${workspaceUiSource}`, /indigo-/);
});

await runTest("ti requests hooks expose mutations and invalidate requests plus dashboard caches", async () => {
  const hookSource = await readModuleSource("hooks/useTiRequests.ts");

  for (const hookName of [
    "useCreateTiRequest",
    "useUpdateTiRequest",
    "useAssignTiRequest",
    "useUpdateTiRequestStatus",
    "useCreateTiRequestMessage",
    "useCreateTiRequestCategory",
    "useUpdateTiRequestCategory",
  ]) {
    assert.match(hookSource, new RegExp(`function ${hookName}\\(`));
  }

  assert.match(hookSource, /useMutation/);
  assert.match(hookSource, /useQueryClient/);
  assert.match(hookSource, /invalidateQueries\(\{\s*queryKey: tiQueryKeys\.requests\.all\(\)/);
  assert.match(hookSource, /invalidateQueries\(\{\s*queryKey: tiQueryKeys\.dashboard\(\)/);
});

await runTest("ti requests tab consumes live hooks instead of rendering only an empty stub", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");

  assert.match(tabSource, /useTiRequests\(/);
  assert.match(tabSource, /useTiRequestCategories\(/);
  assert.match(tabSource, /useTiRequestMessages\(/);
  assert.match(tabSource, /useCreateTiRequest/);
  assert.match(tabSource, /useUpdateTiRequestStatus/);
  assert.match(tabSource, /useCreateTiRequestMessage/);
  assert.match(tabSource, /TiEmptyState/);
  assert.match(tabSource, /isLoading|isFetching/);
  assert.match(tabSource, /isError/);
  assert.doesNotMatch(tabSource, /const\s+(requests|messages|categories)\s*=\s*\[/);
});

await runTest("ti requests creation opens in a dialog and leaves filters spanning the workspace", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");

  assert.match(tabSource, /import \{ Dialog \} from "@shared\/components";/);
  assert.match(tabSource, /const \[isCreateDialogOpen, setIsCreateDialogOpen\] = useState\(false\)/);
  assert.match(tabSource, /open=\{isCreateDialogOpen\}/);
  assert.match(tabSource, /title="Novo chamado"/);
  assert.match(tabSource, /contentClassName="w-\[min\(94vw,860px\)\]"/);
  assert.match(tabSource, /md:grid-cols-\[minmax\(320px,1fr\)_180px_220px\]/);
  assert.match(tabSource, /lg:grid-cols-\[minmax\(420px,1fr\)_180px_220px\]/);
  assert.match(tabSource, /<div className="space-y-4">/);
  assert.doesNotMatch(tabSource, /isCreateFormOpen/);
  assert.doesNotMatch(tabSource, /Fechar formul/);
});

await runTest("ti request detail opens in a dialog instead of a stretched side panel", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");
  const workspaceUiSource = await readModuleSource("components/tiWorkspaceUi.ts");

  assert.match(tabSource, /const \[isDetailDialogOpen, setIsDetailDialogOpen\] = useState\(false\)/);
  assert.match(tabSource, /open=\{isDetailDialogOpen\}/);
  assert.match(tabSource, /title=\{activeRequest \? getRequestTitle\(activeRequest\) : "Detalhe do chamado"\}/);
  assert.match(tabSource, /contentClassName="w-\[min\(94vw,920px\)\][^"]*border-slate-300/);
  assert.match(tabSource, /tiDialogSectionClassName/);
  assert.match(tabSource, /tiDialogSubsectionClassName/);
  assert.match(workspaceUiSource, /ring-slate-950\/5/);
  assert.match(workspaceUiSource, /dark:ring-white\/5/);
  assert.match(tabSource, /setIsDetailDialogOpen\(true\)/);
  assert.doesNotMatch(tabSource, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(320px,420px\)\]/);
  assert.doesNotMatch(tabSource, /title="Selecione um chamado"/);
});

await runTest("ti request detail keeps secondary actions compact", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");

  assert.doesNotMatch(tabSource, /<details/);
  assert.doesNotMatch(tabSource, /<summary/);
  assert.match(tabSource, /Editar chamado/);
  assert.match(tabSource, /Status do chamado/);
  assert.match(tabSource, /onChange=\{\(event\) => handleUpdateStatus\(event\.target\.value\)\}/);
  assert.match(tabSource, /lg:grid-cols-5/);
  assert.match(tabSource, /border-t border-slate-200 pt-3/);
  assert.match(tabSource, /min-h-16/);
  assert.doesNotMatch(tabSource, /REQUEST_STATUS_ACTIONS\.map/);
  assert.doesNotMatch(tabSource, /Atualiza o fluxo do atendimento/);
  assert.doesNotMatch(tabSource, /Expandir/);
  assert.doesNotMatch(tabSource, /Editar t.tulo/);
});

await runTest("ti request detail does not fetch admin users for assignment automatically", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");

  assert.match(tabSource, /useAssignTiRequest/);
  assert.match(tabSource, /handleAssignToMe/);
  assert.match(tabSource, /"Assumir"/);
  assert.doesNotMatch(tabSource, /Assumir chamado/);
  assert.match(tabSource, /assigned_to_id: currentUser\.id/);
  assert.doesNotMatch(tabSource, /useTiAssignableUsers/);
  assert.doesNotMatch(tabSource, /assignableUserOptions/);
  assert.doesNotMatch(tabSource, /Atribuir à equipe de TI/);
  assert.doesNotMatch(tabSource, /listAdminUsers/);
  assert.doesNotMatch(tabSource, /placeholder="ID do usuário"/);
  assert.doesNotMatch(tabSource, /assignedUserId/);
});

await runTest("ti requests payloads follow the backend request schema", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");
  const typeSource = await readModuleSource("types/requests.ts");

  for (const expectedToken of [
    "urgency",
    "Low",
    "Medium",
    "High",
    "Critical",
    "New",
    "In_Progress",
    "Waiting",
    "Resolved",
    "Closed",
  ]) {
    assert.match(tabSource, new RegExp(expectedToken));
  }

  assert.match(typeSource, /urgency\?: string/);
  assert.doesNotMatch(typeSource, /priority\?:/);
  assert.doesNotMatch(tabSource, /REQUEST_PRIORITY_OPTIONS/);
  assert.doesNotMatch(tabSource, /priority:/);
  assert.doesNotMatch(tabSource, /name="priority"/);
  assert.doesNotMatch(tabSource, /Prioridade/);
  assert.doesNotMatch(tabSource, /value: "open"/);
  assert.doesNotMatch(tabSource, /value: "in_progress"/);
  assert.doesNotMatch(tabSource, /value: "resolved"/);
  assert.doesNotMatch(tabSource, /value: "closed"/);
  assert.doesNotMatch(tabSource, /category_id: requestDraft\.category_id \|\| null/);
  assert.doesNotMatch(tabSource, /description: requestDraft\.description\.trim\(\) \|\| null/);
});

await runTest("ti requests tab keeps text search local and renders requester labels", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");

  assert.match(tabSource, /const \[searchTerm, setSearchTerm\] = useState\(""\)/);
  assert.match(tabSource, /const requestFilters = useMemo/);
  assert.match(tabSource, /const filteredRequests = useMemo/);
  assert.match(tabSource, /useTiRequests\(requestFilters\)/);
  assert.match(tabSource, /getRequesterLabel/);
  assert.match(tabSource, /Solicitante/);
  assert.match(tabSource, /currentUser/);
  assert.doesNotMatch(tabSource, /useState<TiListFilters>\(\{ search:/);
  assert.doesNotMatch(tabSource, /search: event\.target\.value/);
});

await runTest("ti requests tab exposes request category management actions", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");

  assert.match(tabSource, /useCreateTiRequestCategory/);
  assert.match(tabSource, /useUpdateTiRequestCategory/);
  assert.match(tabSource, /const \[isCategoryDialogOpen, setIsCategoryDialogOpen\] = useState\(false\)/);
  assert.match(tabSource, /label="Categorias"/);
  assert.match(tabSource, /title="Categorias de chamados"/);
  assert.match(tabSource, /Adicionar categoria/);
  assert.match(tabSource, /Criar categoria/);
  assert.match(tabSource, /Inativar/);
  assert.match(tabSource, /Ativar/);
  assert.match(tabSource, /createCategoryMutation\.mutateAsync/);
  assert.match(tabSource, /updateCategoryMutation\.mutateAsync/);
  assert.match(tabSource, /active: !isCategoryActive\(category\)/);
  assert.doesNotMatch(tabSource, /Nova categoria/);
  assert.doesNotMatch(tabSource, /Editar categoria/);
  assert.doesNotMatch(tabSource, /Salvar categoria/);
  assert.doesNotMatch(tabSource, /handleStartEditCategory/);
  assert.doesNotMatch(tabSource, /editingCategoryId/);
  assert.doesNotMatch(
    tabSource,
    /<p className="text-xs text-slate-500 dark:text-slate-400">\s*{category\.id}\s*<\/p>/,
  );
});

await runTest("ti native select uses a centered chevron instead of the browser default arrow", async () => {
  const selectSource = await readModuleSource("components/TiNativeSelect.tsx");

  assert.match(selectSource, /ChevronDown/);
  assert.match(selectSource, /appearance-none/);
  assert.match(selectSource, /pr-10/);
  assert.match(selectSource, /pointer-events-none/);
  assert.match(selectSource, /absolute right-3 top-1\/2/);
  assert.match(selectSource, /-translate-y-1\/2/);
  assert.match(selectSource, /aria-hidden="true"/);
});

await runTest("ti dashboard tab consumes the consolidated backend summary", async () => {
  const tabSource = await readModuleSource("components/TiDashboardTab.tsx");
  const dashboardTypesSource = await readModuleSource("types/dashboard.ts");

  assert.match(tabSource, /useTiDashboard\(/);
  assert.match(tabSource, /openRequests/);
  assert.match(tabSource, /criticalRequests/);
  assert.match(tabSource, /resolvedLastSevenDays/);
  assert.match(tabSource, /inventoryAssets/);
  assert.match(tabSource, /lowStockItems/);
  assert.match(tabSource, /activeRobots/);
  assert.match(dashboardTypesSource, /openRequests: number/);
  assert.match(dashboardTypesSource, /inventoryAssets: number/);
  assert.doesNotMatch(tabSource, /requests_open/);
  assert.doesNotMatch(tabSource, /inventory_total/);
  assert.match(tabSource, /isLoading|isFetching/);
  assert.match(tabSource, /isError/);
});

await runTest("ti inventory and terms expose PR4 mutations through hooks", async () => {
  const inventoryHooksSource = await readModuleSource("hooks/useTiInventory.ts");
  const termsHooksSource = await readModuleSource("hooks/useTiTerms.ts");

  for (const expected of [
    "useCreateTiInventoryAssetMutation",
    "useUpdateTiInventoryAssetMutation",
    "useAssignTiInventoryAssetUserMutation",
    "useReturnTiInventoryAssetMutation",
    "useCreateTiInventoryCategoryMutation",
    "useUpdateTiInventoryCategoryMutation",
    "useCreateTiInventoryLocationMutation",
    "useUpdateTiInventoryLocationMutation",
  ]) {
    assert.match(inventoryHooksSource, new RegExp(`function\\s+${expected}`));
  }

  for (const expected of [
    "useCreateTiTermMutation",
    "useUpdateTiTermMutation",
    "useSignTiTermMutation",
  ]) {
    assert.match(termsHooksSource, new RegExp(`function\\s+${expected}`));
  }

  assert.match(inventoryHooksSource, /useMutation/);
  assert.match(inventoryHooksSource, /useQueryClient/);
  assert.match(inventoryHooksSource, /tiQueryKeys\.inventory\.all\(\)/);
  assert.match(inventoryHooksSource, /tiQueryKeys\.dashboard\(\)/);
  assert.match(termsHooksSource, /useMutation/);
  assert.match(termsHooksSource, /useQueryClient/);
  assert.match(termsHooksSource, /tiQueryKeys\.terms\.all\(\)/);
  assert.match(termsHooksSource, /tiQueryKeys\.inventory\.all\(\)/);
  assert.match(termsHooksSource, /tiQueryKeys\.dashboard\(\)/);
});

await runTest("ti inventory and terms tabs use shared controls for filters and dialogs", async () => {
  for (const tabPath of ["components/TiInventoryTab.tsx", "components/TiTermsTab.tsx"]) {
    const source = await readModuleSource(tabPath);

    assert.match(source, /TiNativeSelect/);
    assert.match(source, /Dialog/);
    assert.doesNotMatch(source, /<select\b/);
    assert.doesNotMatch(source, /style=\{/);
  }
});

await runTest("ti inventory tab exposes assets, categories, locations, assignment and return actions", async () => {
  const source = await readModuleSource("components/TiInventoryTab.tsx");
  const controlsSource = await readModuleSource("components/tiFormControls.tsx");

  for (const expected of [
    "Novo ativo",
    "Categorias",
    "Locais",
    "Atribuir usuario",
    "Registrar devolucao",
  ]) {
    assert.match(source, new RegExp(expected));
  }

  assert.match(`${source}\n${controlsSource}`, /Tentar novamente/);

  assert.match(source, /useTiInventory\(/);
  assert.match(source, /useTiInventoryAsset\(/);
  assert.match(source, /useTiInventoryCategories\(/);
  assert.match(source, /useTiInventoryLocations\(/);
  assert.match(source, /confirm\(/);
});

await runTest("ti terms tab exposes term create, edit, detail and signing actions", async () => {
  const source = await readModuleSource("components/TiTermsTab.tsx");
  const controlsSource = await readModuleSource("components/tiFormControls.tsx");

  for (const expected of [
    "Novo termo",
    "Assinar termo",
    "Editar termo",
  ]) {
    assert.match(source, new RegExp(expected));
  }

  assert.match(`${source}\n${controlsSource}`, /Tentar novamente/);

  assert.match(source, /useTiTerms\(/);
  assert.match(source, /useTiTerm\(/);
  assert.match(source, /useTiInventory\(/);
  assert.match(source, /confirm\(/);
});
