import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = fileURLToPath(new URL("./", import.meta.url));
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
    "/ti/stock/items/{id}/movements/list",
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

await runTest("ti stock hooks expose mutations and invalidate stock plus dashboard caches", async () => {
  const hookSource = await readModuleSource("hooks/useTiStock.ts");
  const serviceSource = await readModuleSource("services/tiStockService.ts");

  for (const method of [
    "listStockItems",
    "createStockItem",
    "getStockItemById",
    "updateStockItem",
    "createStockEntry",
    "createStockExit",
    "listStockItemMovements",
    "listStockCategories",
    "createStockCategory",
    "updateStockCategory",
    "listStockLocations",
    "createStockLocation",
    "updateStockLocation",
  ]) {
    assert.match(serviceSource, new RegExp(`async\\s+${method}\\s*\\(`));
  }

  for (const mutation of [
    "useCreateTiStockItemMutation",
    "useUpdateTiStockItemMutation",
    "useCreateTiStockEntryMutation",
    "useCreateTiStockExitMutation",
    "useTiStockItemMovements",
    "useCreateTiStockCategoryMutation",
    "useUpdateTiStockCategoryMutation",
    "useCreateTiStockLocationMutation",
    "useUpdateTiStockLocationMutation",
  ]) {
    assert.match(hookSource, new RegExp(`export function ${mutation}`));
  }

  assert.match(hookSource, /useMutation/);
  assert.match(hookSource, /useQueryClient/);
  assert.match(hookSource, /tiQueryKeys\.stock\.all\(\)/);
  assert.match(hookSource, /tiQueryKeys\.dashboard\(\)/);
});

await runTest("ti stock list preserves server pagination metadata", async () => {
  const serviceSource = await readModuleSource("services/tiStockService.ts");
  const hookSource = await readModuleSource("hooks/useTiStock.ts");

  assert.match(serviceSource, /PaginatedResult<TiStockItem>/);
  assert.match(serviceSource, /normalizePaginatedResult/);
  assert.match(serviceSource, /page:\s*Number\(filters\?\.page\s*\?\?\s*1\)/);
  assert.match(serviceSource, /limit:\s*Number\(filters\?\.page_size\s*\?\?\s*50\)/);
  assert.match(hookSource, /UseQueryResult<PaginatedResult<TiStockItem>, Error>/);
});

await runTest("ti stock location display never falls back to a raw id", async () => {
  const { resolveTiStockLocationName } = await import("./utils/stockDisplay.ts");
  const locations = [{ id: 24, name: "Almoxarifado TI" }];

  assert.equal(
    resolveTiStockLocationName(
      { id: 1, location_id: 24, location: { id: 24, name: "Sala de Equipamentos" } },
      locations,
    ),
    "Sala de Equipamentos",
  );
  assert.equal(
    resolveTiStockLocationName({ id: 2, location_id: 24 }, locations),
    "Almoxarifado TI",
  );
  assert.equal(
    resolveTiStockLocationName({ id: 3, location_id: 99 }, locations),
    "Local não informado",
  );
});

await runTest("ti stock filters reset and render server pagination", async () => {
  const tabSource = await readModuleSource("components/TiStockTab.tsx");

  assert.match(tabSource, /const STOCK_PAGE_SIZE = 50/);
  assert.match(tabSource, /const \[stockPage, setStockPage\] = useState\(1\)/);
  assert.match(tabSource, /page:\s*stockPage/);
  assert.match(tabSource, /page_size:\s*STOCK_PAGE_SIZE/);
  assert.match(tabSource, /setStockPage\(1\)/);
  assert.match(tabSource, /<PaginationControls/);
  assert.match(tabSource, /resolveTiStockLocationName/);
  assert.doesNotMatch(
    tabSource,
    /getRelatedName\(item\.location,\s*item\.location_id\)/,
  );
});

await runTest("ti stock pagination stays outside the scrollable table", async () => {
  const tabSource = await readModuleSource("components/TiStockTab.tsx");
  const tableIndex = tabSource.indexOf("<TiDataTable");
  const tableCloseIndex = tabSource.indexOf("</TiDataTable>", tableIndex);
  const paginationIndex = tabSource.indexOf("<PaginationControls", tableIndex);

  assert.ok(tableIndex > 0);
  assert.ok(tableCloseIndex > tableIndex);
  assert.ok(paginationIndex > tableCloseIndex);
});

await runTest("ti stock tab renders operational item, movement, category and location workflows", async () => {
  const tabSource = await readModuleSource("components/TiStockTab.tsx");

  for (const token of [
    "useTiStockItems",
    "useTiStockItem",
    "useTiStockItemMovements",
    "useCreateTiStockItemMutation",
    "useUpdateTiStockItemMutation",
    "useCreateTiStockEntryMutation",
    "useCreateTiStockExitMutation",
    "useCreateTiStockCategoryMutation",
    "useCreateTiStockLocationMutation",
    "window.confirm",
    "Entrada",
    "Saída",
    "Categorias",
    "Locais",
  ]) {
    assert.match(tabSource, new RegExp(token.replaceAll(".", "\\.")));
  }

  assert.match(tabSource, /<TiEmptyState/);
  assert.match(tabSource, /type StockDialogState =/);
  assert.match(tabSource, /const \[stockDialog, setStockDialog\]/);
  assert.match(tabSource, /open=\{stockDialog === "item"\}/);
  assert.match(tabSource, /open=\{stockDialog === "entry"\}/);
  assert.match(tabSource, /open=\{stockDialog === "exit"\}/);
  assert.match(tabSource, /open=\{stockDialog === "categories"\}/);
  assert.match(tabSource, /open=\{stockDialog === "locations"\}/);
  assert.match(tabSource, /const \[isStockDetailDialogOpen, setIsStockDetailDialogOpen\]/);
  assert.match(tabSource, /open=\{isStockDetailDialogOpen\}/);
  assert.match(tabSource, /function openStockDetail\(item: TiStockItem\)/);
  assert.match(tabSource, /title="Categorias de estoque"/);
  assert.match(tabSource, /title="Locais de estoque"/);
  assert.match(tabSource, /aria-label="Operações do estoque"/);
  assert.match(tabSource, /aria-label="Filtros do estoque"/);
  assert.match(tabSource, /aria-label="Conteúdo do estoque"/);
  assert.match(tabSource, /function StockOperationButton/);
  assert.match(tabSource, /type StockFilterDraft/);
  assert.match(tabSource, /const \[stockFilterDraft, setStockFilterDraft\]/);
  assert.match(tabSource, /STOCK_STATUS_FILTER_OPTIONS/);
  assert.match(tabSource, /categoryFilterOptions/);
  assert.match(tabSource, /locationFilterOptions/);
  assert.match(tabSource, /function applyStockFilters/);
  assert.match(tabSource, /name: toOptionalText\(stockFilterDraft\.name\)/);
  assert.match(tabSource, /category_id: toOptionalId\(stockFilterDraft\.category_id\)/);
  assert.match(tabSource, /location_id: toOptionalId\(stockFilterDraft\.location_id\)/);
  assert.match(tabSource, /status: toOptionalText\(stockFilterDraft\.status\)/);
  assert.match(tabSource, /label="Categoria"/);
  assert.match(tabSource, /label="Local"/);
  assert.match(tabSource, /label="Status"/);
  assert.match(tabSource, /<span>Buscar<\/span>/);
  assert.doesNotMatch(tabSource, /Filtrar/);
  assert.doesNotMatch(tabSource, /searchDraft/);
  assert.doesNotMatch(tabSource, /applySearchFilter/);
  assert.doesNotMatch(tabSource, /aria-expanded=\{isStockActionsOpen\}/);
  assert.doesNotMatch(tabSource, /Item selecionado/);
  assert.doesNotMatch(tabSource, /Selecione um item para ver detalhes e movimentar saldo/);
  assert.match(tabSource, /label="Novo item"/);
  assert.match(tabSource, /onClick=\{openCreateItemDialog\}/);
  assert.match(tabSource, /label=\{isStockRefreshing \? "Atualizando\.\.\." : "Atualizar"\}/);
  assert.match(tabSource, /onClick=\{refreshStockWorkspace\}/);
  assert.match(tabSource, /const selectedListItem = stockItems\.find/);
  assert.match(tabSource, /const selectedItem = selectedItemQuery\.data \?\? selectedListItem/);
  assert.match(tabSource, /headers=\{\["Item", "Categoria", "Local", "Saldo", "Status", ""\]\}/);
  assert.match(tabSource, /className=\{cn\(tiFiveRowTableClassName/);
  assert.match(tabSource, /xl:min-h-\[280px\]/);
  assert.match(tabSource, /Saldo atual/);
  assert.match(tabSource, /Movimentacoes/);
  assert.match(tabSource, /stockMovementsQuery/);
  assert.match(tabSource, /selectedItemQuery\.isError/);
  assert.match(tabSource, /const \[movementItemId, setMovementItemId\]/);
  assert.match(tabSource, /stockItemOptions/);
  assert.match(tabSource, /function closeItemDialog/);
  assert.match(tabSource, /function closeEntryDialog/);
  assert.match(tabSource, /function closeExitDialog/);
  assert.match(tabSource, /function closeCategoryDialog/);
  assert.match(tabSource, /function closeLocationDialog/);
  assert.match(tabSource, /openMovementDialog\("entry"\)/);
  assert.match(tabSource, /openMovementDialog\("exit"\)/);
  assert.match(tabSource, /setStockDialog\("categories"\)/);
  assert.match(tabSource, /setStockDialog\("locations"\)/);
  assert.match(tabSource, /setCategoryName\(""\)/);
  assert.match(tabSource, /setLocationName\(""\)/);
  assert.match(tabSource, /stockCategoriesQuery\.refetch\(\)/);
  assert.match(tabSource, /stockLocationsQuery\.refetch\(\)/);
  assert.match(tabSource, /disabled=\{!movementItemId \|\| !canEditStock \|\| isMovementSubmitting\}/);
  assert.doesNotMatch(tabSource, /disabled=\{!selectedItemId\}/);
  assert.doesNotMatch(tabSource, /Ações do estoque/);
  assert.doesNotMatch(tabSource, /Movimentação/);
  assert.doesNotMatch(tabSource, /Cadastros/);
  assert.doesNotMatch(tabSource, /STOCK_WORKSPACE_ACTIONS/);
  assert.doesNotMatch(
    tabSource,
    /<div className="grid gap-5 xl:grid-cols-2">[\s\S]*onSubmit=\{handleSubmitEntry\}[\s\S]*onSubmit=\{handleSubmitExit\}/,
  );

  const filtersIndex = tabSource.indexOf('aria-label="Filtros do estoque"');
  const contentIndex = tabSource.indexOf('aria-label="Conteúdo do estoque"');
  const emptyStateIndex = tabSource.indexOf('title="Nenhum item em estoque"');
  const operationPanelIndex = tabSource.indexOf('aria-label="Operações do estoque"');
  assert.ok(filtersIndex > 0);
  assert.ok(contentIndex > filtersIndex);
  assert.ok(emptyStateIndex > contentIndex);
  assert.ok(operationPanelIndex > emptyStateIndex);
  assert.ok(operationPanelIndex > 0);
});

await runTest("ti stock passwords and extensions reuse shared card and table controls", async () => {
  const controlsSource = await readModuleSource("components/tiFormControls.tsx");

  assert.match(controlsSource, /Carregando informações/);
  assert.match(controlsSource, /Não conseguimos carregar as informações/);
  assert.doesNotMatch(controlsSource, /Carregando dados/);
  assert.doesNotMatch(controlsSource, /Nao foi possivel/);

  for (const componentPath of [
    "components/TiStockTab.tsx",
    "components/TiPasswordsTab.tsx",
    "components/TiExtensionsTab.tsx",
  ]) {
    const source = await readModuleSource(componentPath);

    for (const token of [
      "TiQueryStatePanel",
      "TiDataTable",
      "TiEmptyState",
      "TiFieldLine",
      "TiTableAction",
      "tiCardClassName",
    ]) {
      assert.match(source, new RegExp(token));
    }

    assert.doesNotMatch(source, /function QueryStatePanel/);
    assert.doesNotMatch(source, /function FieldLine/);
    assert.doesNotMatch(source, /function CompactTextField/);
    assert.doesNotMatch(source, /function TextField/);
  }
});

await runTest("ti password contracts separate list data from explicit reveal detail", async () => {
  const typesSource = await readModuleSource("types/passwords.ts");
  const hookSource = await readModuleSource("hooks/useTiPasswords.ts");

  assert.match(typesSource, /export interface TiPasswordListItem/);
  assert.match(typesSource, /export interface TiPasswordDetail/);

  const listInterfaceStart = typesSource.indexOf("export interface TiPasswordListItem");
  const detailInterfaceStart = typesSource.indexOf("export interface TiPasswordDetail");
  const listInterfaceSource = typesSource.slice(listInterfaceStart, detailInterfaceStart);

  assert.doesNotMatch(listInterfaceSource, /\bpassword\??:/);
  assert.match(hookSource, /export function useTiPasswordReveal/);
  assert.match(hookSource, /enabled:\s*Boolean\(id\)\s*&&\s*Boolean\(canReveal\)/);
});

await runTest("ti sensitive clipboard helper copies the exact value", async () => {
  const { copySensitiveText } = await import("./utils/copySensitiveText.ts");
  const writes = [];
  const revealedPassword = "S3nh@ com espaços ";

  const copied = await copySensitiveText(revealedPassword, {
    writeText: async (value) => {
      writes.push(value);
    },
  });

  assert.equal(copied, true);
  assert.deepEqual(writes, [revealedPassword]);
});

await runTest("ti sensitive clipboard helper handles a rejected write", async () => {
  const { copySensitiveText } = await import("./utils/copySensitiveText.ts");

  assert.equal(
    await copySensitiveText("segredo de teste", {
      writeText: async () => {
        throw new Error("NotAllowedError");
      },
    }),
    false,
  );
});

await runTest("ti sensitive clipboard helper handles an unavailable writer", async () => {
  const { copySensitiveText } = await import("./utils/copySensitiveText.ts");

  assert.equal(await copySensitiveText("segredo de teste", undefined), false);
});

await runTest("ti password copy uses the safe helper and generic feedback", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(tabSource, /import \{ copySensitiveText \} from "\.\.\/utils\/copySensitiveText"/);
  assert.match(
    tabSource,
    /const clipboard = typeof navigator === "undefined" \? undefined : navigator\.clipboard/,
  );
  assert.match(tabSource, /const copied = await copySensitiveText\(secret, clipboard\)/);
  assert.match(tabSource, /toast\.success\("Senha copiada\."\)/);
  assert.match(
    tabSource,
    /toast\.error\(\s*"Não foi possível copiar a senha\. Verifique a permissão da área de transferência\.",?\s*\)/,
  );
  assert.doesNotMatch(tabSource, /navigator\.clipboard\.writeText\(secret\)/);
  assert.doesNotMatch(tabSource, /document\.execCommand/);
});

await runTest("ti passwords tab never renders secrets in list and reveals only by explicit action", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(tabSource, /const \[revealPasswordId, setRevealPasswordId\]/);
  assert.match(
    tabSource,
    /useTiPasswordReveal\(\s*revealPasswordId,\s*Boolean\(revealPasswordId\)\s*&&\s*canRevealPasswords/,
  );
  assert.match(tabSource, /<MaskedSecret\s*\/>/);
  assert.match(tabSource, /setRevealPasswordId\(item\.id\)/);
  assert.match(tabSource, /setRevealPasswordId\(null\)/);
  assert.doesNotMatch(tabSource, /\.map\(\(item[^]*?item\.password[^]*?\)\)/);
  assert.doesNotMatch(tabSource, /passwordRows[^]*?\.password/);
});

await runTest("ti passwords tab keeps create edit flows in a dialog and filters by local", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");
  const dialogSource = await readAppSource("src/shared/components/ui/Dialog.tsx");

  assert.match(tabSource, /import \{ Dialog \} from "@shared\/components\/ui\/Dialog"/);
  assert.match(tabSource, /const \[filters, setFilters\] = useState<TiListFilters>\(\{\}\)/);
  assert.match(tabSource, /const \[localSearchDraft, setLocalSearchDraft\] = useState\(""\)/);
  assert.match(tabSource, /const \[isPasswordDialogOpen, setIsPasswordDialogOpen\] = useState\(false\)/);
  assert.match(tabSource, /function applyPasswordFilters/);
  assert.match(tabSource, /local: toOptionalText\(localSearchDraft\)/);
  assert.match(tabSource, /aria-label="Filtros de senhas"/);
  assert.match(tabSource, /label="Buscar local"/);
  assert.match(tabSource, /placeholder="Local da senha"/);
  assert.match(tabSource, /open=\{isPasswordDialogOpen\}/);
  assert.match(tabSource, /title=\{editingPassword \? "Editar senha" : "Nova senha"\}/);
  assert.doesNotMatch(dialogSource, /@shared\/ui\/newLayout\/utils/);
  assert.doesNotMatch(dialogSource, /contentClassName,\s*\)\}/);
  assert.match(tabSource, /aria-label="Conteúdo de senhas"/);
  assert.match(tabSource, /<form className="space-y-2" onSubmit=\{handleSubmitPassword\}>/);
  assert.match(tabSource, /onClick=\{openCreateForm\}/);
  assert.match(tabSource, /<span>Buscar<\/span>/);
  assert.doesNotMatch(
    tabSource,
    /<form className="space-y-2" onSubmit=\{handleSubmitPassword\}>[\s\S]*?className="grid gap-3 md:grid-cols-2"/,
  );
  assert.doesNotMatch(
    tabSource,
    /<form\s+className=\{`\$\{tiCardClassName\} space-y-3`\}\s+onSubmit=\{handleSubmitPassword\}/,
  );
});

await runTest("ti password reveal clears sensitive detail cache when hidden", async () => {
  const hookSource = await readModuleSource("hooks/useTiPasswords.ts");
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(hookSource, /export function useClearTiPasswordRevealCache/);
  assert.match(
    hookSource,
    /removeQueries\(\{\s*queryKey:\s*tiQueryKeys\.passwords\.detail\(id\),\s*exact:\s*true,?\s*\}\)/,
  );
  assert.match(tabSource, /const clearPasswordRevealCache = useClearTiPasswordRevealCache\(\)/);
  assert.match(tabSource, /clearPasswordRevealCache\(revealPasswordId\)/);
  assert.match(tabSource, /setRevealPasswordId\(null\)/);
});

await runTest("ti user selects reuse the paginated assignable users source", async () => {
  const hookSource = await readAppSource("src/modules/rh/hooks/useAssignableUsers.ts");

  assert.match(hookSource, /listAdminUsers\("active"\)/);
  assert.doesNotMatch(hookSource, /const page = await userService\.listPage\(\{\s*skip:\s*0,/);

  for (const componentPath of [
    "components/TiStockTab.tsx",
    "components/TiPasswordsTab.tsx",
    "components/TiExtensionsTab.tsx",
  ]) {
    const source = await readModuleSource(componentPath);

    assert.match(source, /useAssignableUsers/);
  }
});

await runTest("ti extension hooks and tab expose ramal mutations", async () => {
  const hookSource = await readModuleSource("hooks/useTiExtensions.ts");
  const tabSource = await readModuleSource("components/TiExtensionsTab.tsx");

  for (const mutation of [
    "useCreateTiExtensionMutation",
    "useUpdateTiExtensionMutation",
  ]) {
    assert.match(hookSource, new RegExp(`export function ${mutation}`));
    assert.match(tabSource, new RegExp(mutation));
  }

  assert.match(hookSource, /useMutation/);
  assert.match(hookSource, /tiQueryKeys\.extensions\.all\(\)/);
  assert.match(tabSource, /useTiExtensions/);
  assert.match(tabSource, /useTiExtension/);
  assert.match(tabSource, /<TiEmptyState/);
  const sectionHeaderMatch = tabSource.match(/<TiSectionHeader[\s\S]*?\/>/);
  assert.ok(sectionHeaderMatch);
  assert.doesNotMatch(sectionHeaderMatch[0], /action=/);
  assert.match(tabSource, /selectedExtensionId\s*\?\s*\(/);
  assert.doesNotMatch(tabSource, /Selecione um ramal para ver detalhes\./);
  assert.match(tabSource, /Criar ramal/);
  assert.match(tabSource, /placeholder="Ex: 1001"/);
  assert.doesNotMatch(tabSource, /placeholder="1001"/);
  assert.match(tabSource, /className=\{tiFiveRowTableClassName\}/);
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
  assert.match(pageSource, /tiThinScrollbarClassName/);
  assert.match(workspaceUiSource, /export const tiThinScrollbarClassName/);
  assert.doesNotMatch(pageSource, /md:flex-1/);
  assert.match(pageSource, /shrink-0 items-center justify-center/);
  assert.doesNotMatch(pageSource, /truncate/);
  assert.match(pageSource, /from-blue-500 to-blue-600/);
  assert.match(pageSource, /bg-blue-100 text-blue-700/);
  assert.doesNotMatch(`${pageSource}\n${workspaceUiSource}`, /indigo-/);
});

await runTest("ti shell limits self-service tabs to chamados and meus termos", async () => {
  const pageSource = await readModuleSource("components/TiPage.tsx");

  assert.match(pageSource, /SELF_SERVICE_TI_TABS/);
  assert.match(pageSource, /const canManageTi = access\.isAdmin/);
  assert.match(pageSource, /const visibleTabs = canManageTi \? TI_TABS : SELF_SERVICE_TI_TABS/);
  assert.match(pageSource, /label: "Meus termos"/);
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
  assert.doesNotMatch(tabSource, /isCreateFormOpen/);
  assert.doesNotMatch(tabSource, /Fechar formul/);
});

await runTest("ti request detail opens in a dialog instead of a stretched side panel", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");

  assert.match(tabSource, /const \[isDetailDialogOpen, setIsDetailDialogOpen\] = useState\(false\)/);
  assert.match(tabSource, /open=\{isDetailDialogOpen\}/);
  assert.match(tabSource, /title=\{activeRequest \? getRequestTitle\(activeRequest\) : "Detalhe do chamado"\}/);
  assert.match(tabSource, /tiDialogSectionClassName/);
  assert.match(tabSource, /tiDialogSubsectionClassName/);
  assert.match(tabSource, /setIsDetailDialogOpen\(true\)/);
  assert.doesNotMatch(tabSource, /title="Selecione um chamado"/);
});

await runTest("ti request detail keeps secondary actions compact", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");

  assert.match(tabSource, /const canManageRequests = access\.isAdmin/);
  assert.match(tabSource, /canManageRequests && !hasAssignee/);
  assert.match(tabSource, /canManageRequests \? \(/);
  assert.doesNotMatch(tabSource, /<details/);
  assert.doesNotMatch(tabSource, /<summary/);
  assert.match(tabSource, /Editar chamado/);
  assert.match(tabSource, /Status do chamado/);
  assert.match(tabSource, /onChange=\{\(event\) => handleUpdateStatus\(event\.target\.value\)\}/);
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
  assert.match(tabSource, /const filteredRequests = useMemo/);
  assert.match(tabSource, /useTiRequests\(filters\)/);
  assert.doesNotMatch(tabSource, /const requestFilters = useMemo/);
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
});

await runTest("ti native select uses a centered chevron instead of the browser default arrow", async () => {
  const selectSource = await readModuleSource("components/TiNativeSelect.tsx");

  assert.match(selectSource, /ChevronDown/);
  assert.match(selectSource, /appearance-none/);
  assert.match(selectSource, /pr-10/);
  assert.match(selectSource, /relative/);
  assert.match(selectSource, /pointer-events-none/);
  assert.match(selectSource, /absolute right-3 top-1\/2/);
  assert.match(selectSource, /-translate-y-1\/2/);
  assert.match(selectSource, /aria-hidden="true"/);
  assert.match(selectSource, /Omit<SelectHTMLAttributes<HTMLSelectElement>, "style">/);
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

await runTest("ti inventory tab uses current backend field names", async () => {
  const source = await readModuleSource("components/TiInventoryTab.tsx");
  const typeSource = await readModuleSource("types/inventory.ts");

  assert.match(source, /asset\.asset_code/);
  assert.match(source, /asset\.user/);
  assert.match(source, /asset\.responsible_it_staff/);
  assert.match(source, /asset_code: getFormText\(formData, "asset_code"\)/);
  assert.match(source, /user_id: userId/);
  assert.match(source, /name="asset_code"/);
  assert.match(source, /name="user_id"/);
  assert.match(typeSource, /asset_code\?: string/);
  assert.match(typeSource, /user_id\?: TiId \| null/);
  assert.match(typeSource, /responsible_it_staff\?:/);
  assert.doesNotMatch(source, /code: getFormText\(formData, "code"\)/);
  assert.doesNotMatch(source, /assigned_user_id: userId/);
  assert.doesNotMatch(source, /status: getFormText\(formData, "status"\)/);
  assert.doesNotMatch(source, /name="status"/);
});

await runTest("ti inventory tab exposes assets, categories, departments, assignment and return actions", async () => {
  const source = await readModuleSource("components/TiInventoryTab.tsx");
  const controlsSource = await readModuleSource("components/tiFormControls.tsx");

  for (const expected of [
    "Novo ativo",
    "Categorias",
    "Departamento",
    "Atribuir usuário",
    "Registrar devolução",
  ]) {
    assert.match(source, new RegExp(expected));
  }

  assert.match(`${source}\n${controlsSource}`, /Tentar novamente/);

  assert.match(source, /useTiInventory\(/);
  assert.match(source, /useTiInventoryAsset\(/);
  assert.match(source, /useTiInventoryCategories\(/);
  assert.match(source, /departmentService\.list\(\)/);
  assert.match(source, /useFetch<DepItem\[\]>/);
  assert.doesNotMatch(source, /useTiInventoryLocations\(/);
  assert.match(source, /confirm\(/);
});

await runTest("ti inventory department options come from the global department endpoint", async () => {
  const source = await readModuleSource("components/TiInventoryTab.tsx");

  assert.match(source, /import \{ departmentService, type DepItem \} from "@modules\/departments"/);
  assert.match(source, /const departmentsQuery = useFetch<DepItem\[\]>/);
  assert.match(source, /\["ti-inventory", "departments"\]/);
  assert.match(source, /\(\) => departmentService\.list\(\)/);
  assert.doesNotMatch(source, /departmentService\.list\(\{ status: "Ativo" \}\)/);
  assert.match(source, /departmentsById/);
  assert.match(source, /departmentFilterOptions/);
  assert.match(source, /departmentFormOptions/);
  assert.doesNotMatch(source, /const locationsQuery = useTiInventoryLocations\(\)/);
  assert.doesNotMatch(source, /const locationsById/);
  assert.doesNotMatch(source, /const locationOptions/);
});

await runTest("ti inventory keeps primary actions clear and opens asset detail in a dialog", async () => {
  const source = await readModuleSource("components/TiInventoryTab.tsx");

  assert.equal([...source.matchAll(/label="Novo ativo"/g)].length, 1);
  assert.match(source, /label="Categorias"/);
  assert.doesNotMatch(source, /label="Departamentos"/);
  assert.match(source, /const \[isDetailDialogOpen, setIsDetailDialogOpen\] = useState\(false\)/);
  assert.match(source, /function openAssetDetail\(assetId: TiId\)/);
  assert.match(source, /open=\{isDetailDialogOpen\}/);
  assert.match(source, /title=\{selectedAsset \? getAssetTitle\(selectedAsset\) : "Detalhe do ativo"\}/);
  assert.doesNotMatch(source, /TiDetailPanel/);
});

await runTest("ti inventory catalog edit actions make editing state explicit", async () => {
  const source = await readModuleSource("components/TiInventoryTab.tsx");
  const workspaceUiSource = await readModuleSource("components/tiWorkspaceUi.ts");

  assert.match(source, /function startEditingCategory\(category: TiInventoryCategory\)/);
  assert.match(source, /onClick=\{\(\) => startEditingCategory\(category\)\}/);
  assert.match(source, /editingCategory \? "Editar categoria" : "Adicionar categoria"/);
  assert.match(source, /editingCategory\s*\?\s*"Salvar"\s*:\s*"Criar"/);
  assert.match(source, /editingCategory \? <Save className="h-3\.5 w-3\.5" \/> : <Plus className="h-3\.5 w-3\.5" \/>/);
  assert.match(source, /<X className="h-3\.5 w-3\.5" \/>/);
  assert.match(source, /<span>Cancelar<\/span>/);
  assert.doesNotMatch(source, /<Check className="h-3\.5 w-3\.5" \/>/);
  assert.doesNotMatch(source, /Atualizar categoria|Cancelar edição/);
  assert.doesNotMatch(source, /Editando categoria:/);
  assert.doesNotMatch(source, /Nova categoria/);
  assert.doesNotMatch(source, /Adicionar departamento|Criar departamento|Atualizar departamento|Editar departamento/);
  assert.match(workspaceUiSource, /tiCompactButtonClassName/);
  assert.match(source, /className=\{cn\(tiPrimaryButtonClassName, tiCompactButtonClassName\)\}/);
  assert.match(source, /className=\{cn\(tiSecondaryButtonClassName, tiCompactButtonClassName\)\}/);
  assert.match(source, /const isEditingCategory = String\(editingCategory\?\.id\) === String\(category\.id\)/);
  assert.match(source, /config=\{\{ label: "Em edição", variant: "info" \}\}/);
  assert.match(source, /disabled=\{!canManage\}/);
});

await runTest("ti inventory category form sends the backend category contract", async () => {
  const source = await readModuleSource("components/TiInventoryTab.tsx");
  const typesSource = await readModuleSource("types/inventory.ts");
  const categoryPayloadSource = typesSource.slice(
    typesSource.indexOf("export interface TiInventoryCategoryPayload"),
    typesSource.indexOf("export interface TiInventoryLocationPayload"),
  );

  assert.match(source, /const categoryActive = getFormText\(formData, "active"\)/);
  assert.match(source, /tag: getFormText\(formData, "tag"\)/);
  assert.match(source, /active: categoryActive \? categoryActive === "active" : undefined/);
  assert.match(source, /name="active"/);
  assert.match(categoryPayloadSource, /active\?: boolean/);
  assert.match(categoryPayloadSource, /tag\?: string/);
  assert.doesNotMatch(source, /description: getFormText\(formData, "description"\)/);
  assert.doesNotMatch(source, /status: activeStatus/);
  assert.doesNotMatch(source, /is_active: activeStatus/);
  assert.doesNotMatch(categoryPayloadSource, /status\?: string \| boolean/);
});

await runTest("ti inventory copy uses backend inventory labels", async () => {
  const source = await readModuleSource("components/TiInventoryTab.tsx");

  assert.match(source, /placeholder="Código patrimonial"/);
  assert.match(source, /label="Código patrimonial"/);
  assert.match(source, /label="Responsável TI"/);
  assert.match(source, /label="Departamento"/);
  assert.match(source, /"Ativo"/);
  assert.match(source, /"Categoria"/);
  assert.match(source, /"Departamento"/);
  assert.match(source, /"Usuário"/);
  assert.match(source, /Departamento sem nome/);
  assert.doesNotMatch(source, /placeholder="Nome, código ou serial"/);
  assert.doesNotMatch(source, /label="Nº de série"/);
  assert.doesNotMatch(source, /label="Serial"/);
  assert.doesNotMatch(source, /label="Local"/);
  assert.doesNotMatch(source, /title="Locais"/);
  assert.doesNotMatch(source, /title="Departamentos"/);
  assert.doesNotMatch(source, /Criar departamento|Atualizar departamento|Adicionar departamento|Editar departamento/);
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
  assert.match(source, /const canManage = access\.isAdmin/);
  assert.match(source, /useTiInventory\(undefined, \{ enabled: canManage \}\)/);
  assert.match(source, /departmentService\.list\(\),\s*\{ retry: false, enabled: canManage \}/);
  assert.match(source, /confirm\(/);
});

await runTest("ti terms keeps primary action clear and opens term detail in a dialog", async () => {
  const source = await readModuleSource("components/TiTermsTab.tsx");

  assert.equal([...source.matchAll(/label="Novo termo"/g)].length, 1);
  assert.match(source, /Printer/);
  assert.match(source, /function handlePrintTerm\(term: TiTerm\)/);
  assert.match(source, /function buildPrintableTermHtml\(term: TiTerm, departmentName: string\)/);
  assert.match(source, /window\.open\("", "_blank", "width=900,height=1100"\)/);
  assert.match(source, /import \{ toast \} from "react-toastify";/);
  assert.match(
    source,
    /toast\.error\(\s*"Não foi possível abrir a janela de impressão\. Verifique o bloqueador de pop-ups do navegador\."\s*,?\s*\)/,
  );
  assert.match(source, /printWindow\.print\(\)/);
  assert.match(source, /Imprimir \/ PDF/);
  assert.match(source, /const \[isDetailDialogOpen, setIsDetailDialogOpen\] = useState\(false\)/);
  assert.match(source, /function openTermDetail\(termId: TiId\)/);
  assert.match(source, /open=\{isDetailDialogOpen\}/);
  assert.match(source, /title=\{selectedTerm \? getTermTitle\(selectedTerm\) : "Detalhe do termo"\}/);
  assert.doesNotMatch(source, /TiDetailPanel/);
});

await runTest("ti terms form dialog stays scrollable and compact", async () => {
  const source = await readModuleSource("components/TiTermsTab.tsx");

  assert.match(source, /<form className="space-y-3"/);
  assert.match(source, /label="Nome do usuário"[\s\S]*label="CPF do usuário"/);
  assert.match(source, /label="Ativo"[\s\S]*label="Código do ativo"[\s\S]*label="Marca"[\s\S]*label="IMEI"/);
  assert.match(source, /label="Equipamentos"[\s\S]*label="Motivo"/);
  assert.match(source, /<Save className="h-3\.5 w-3\.5" \/>[\s\S]*Salvar termo/);
  assert.doesNotMatch(source, /tiDialogSectionClassName/);
  assert.doesNotMatch(source, /<section className=/);
  assert.doesNotMatch(source, /Dados do usuário|Ativo do termo|Dados adicionais do ativo|Detalhes do termo/);
  assert.doesNotMatch(source, /dialogState\?\.type === "term" && dialogState\.mode === "edit" \? \(/);
});

await runTest("ti terms filters stay local because the backend list only supports user_id", async () => {
  const source = await readModuleSource("components/TiTermsTab.tsx");

  assert.match(source, /const termsQuery = useTiTerms\(\)/);
  assert.match(source, /const filteredTerms = useMemo\(/);
  assert.match(source, /getTermStatus\(term\)/);
  assert.match(source, /selectedAssetCode/);
  assert.doesNotMatch(source, /useTiTerms\(filters\)/);
  assert.doesNotMatch(source, /inventory_id: assetId/);
  assert.doesNotMatch(source, /asset_id: assetId/);
  assert.doesNotMatch(source, /status,\s*inventory_id/);
});

await runTest("ti terms form sends the backend term contract", async () => {
  const source = await readModuleSource("components/TiTermsTab.tsx");
  const typesSource = await readModuleSource("types/terms.ts");
  const termPayloadSource = typesSource.slice(
    typesSource.indexOf("export interface TiTermPayload"),
    typesSource.indexOf("export interface TiTermSignPayload"),
  );
  const signPayloadSource = typesSource.slice(typesSource.indexOf("export interface TiTermSignPayload"));

  for (const expected of [
    "date",
    "user_name",
    "user_cpf",
    "user_id",
    "department_id",
    "address",
    "reason",
    "equipament_list",
    "brand",
    "asset_code",
    "imei",
  ]) {
    assert.match(source, new RegExp(`${expected}: getFormText\\(formData, "${expected}"\\)`));
  }

  assert.match(source, /name="selected_asset_id"/);
  assert.match(source, /name="department_id"/);
  assert.match(source, /departmentService\.list\(\)/);
  assert.match(source, /reason: getFormText\(formData, "reason"\)/);
  assert.match(signPayloadSource, /reason\?: string/);
  assert.doesNotMatch(source, /title: getFormText\(formData, "title"\)/);
  assert.doesNotMatch(source, /description: getFormText\(formData, "description"\)/);
  assert.doesNotMatch(source, /inventory_id: selectedAssetId/);
  assert.doesNotMatch(source, /asset_id: selectedAssetId/);
  assert.doesNotMatch(source, /status: getFormText\(formData, "status"\)/);
  assert.doesNotMatch(source, /content: getFormText\(formData, "content"\)/);
  assert.doesNotMatch(source, /notes: getFormText\(formData, "notes"\)/);
  assert.doesNotMatch(source, /signer_name/);
  assert.doesNotMatch(termPayloadSource, /title\?:|description\?:|inventory_id\?:|asset_id\?:|content\?:|notes\?:|status\?:/);
  assert.doesNotMatch(signPayloadSource, /signer_name\?:|signed_at\?:|notes\?:/);
});

await runTest("ti inventory category form keeps a stable form reference", async () => {
  const source = await readModuleSource("components/TiInventoryTab.tsx");

  assert.doesNotMatch(source, /event\.currentTarget\.reset\(\)/);
  assert.match(source, /const\s+categoryForm\s*=\s*event\.currentTarget/);
  assert.match(source, /categoryForm\.reset\(\)/);
  assert.doesNotMatch(source, /const\s+locationForm\s*=\s*event\.currentTarget/);
  assert.doesNotMatch(source, /locationForm\.reset\(\)/);
});

await runTest("ti inventory category status supports is_active fallback", async () => {
  const source = await readModuleSource("components/TiInventoryTab.tsx");

  assert.match(source, /item\.status\s*\?\?\s*item\.active\s*\?\?\s*item\.is_active/);
  assert.match(source, /getCatalogStatus\(category\)/);
  assert.match(source, /getCatalogStatus\(editingCategory\)/);
});

await runTest("ti inventory and terms lookup labels use memoized maps", async () => {
  const inventorySource = await readModuleSource("components/TiInventoryTab.tsx");
  const termsSource = await readModuleSource("components/TiTermsTab.tsx");

  assert.match(inventorySource, /categoriesById/);
  assert.match(inventorySource, /departmentsById/);
  assert.match(inventorySource, /new Map/);
  assert.match(termsSource, /assetsById/);
  assert.match(termsSource, /new Map/);
  assert.doesNotMatch(inventorySource, /\(categoriesQuery\.data \?\? \[\]\)\.find/);
  assert.doesNotMatch(inventorySource, /\(departmentsQuery\.data \?\? \[\]\)\.find/);
  assert.doesNotMatch(termsSource, /\(assetsQuery\.data \?\? \[\]\)\.find/);
});

await runTest("ti visible copy keeps Portuguese accents and punctuation consistent", async () => {
  const files = [
    "components/TiDashboardTab.tsx",
    "components/TiExtensionsTab.tsx",
    "components/TiInventoryTab.tsx",
    "components/TiPasswordsTab.tsx",
    "components/TiRobotsTab.tsx",
    "components/TiStockTab.tsx",
    "components/TiTermsTab.tsx",
  ];
  const forbiddenSnippets = [
    "\"--\"",
    "Carregando dados...",
    "Não foi possível carregar.",
    "Nenhum indicador encontrado.",
    "Robos",
    "robo cadastrado",
    "automacoes",
    "historico",
    "execucao",
    "ultimos",
    "saidas",
    "niveis minimos",
    "consumiveis",
    "movimentacoes",
    "nesta area",
    "Nao foi",
    "possivel",
    "acao",
    "atribuicao",
    "devolucao",
    "usuarios",
    "responsaveis",
    "Codigo",
    "Responsavel",
    "usuario",
    "Observacao",
    "Descricao",
    "Gestao",
    "confirmacao",
    "sera",
    "apos",
    "Titulo",
    "vinculo",
    "disponiveis",
    "Conteudo",
  ];

  for (const file of files) {
    const source = await readModuleSource(file);
    const copySource = source.replaceAll('value: "Integracao"', 'value: ""');

    for (const snippet of forbiddenSnippets) {
      assert.equal(
        copySource.includes(snippet),
        false,
        `${file} should not include unpolished copy: ${snippet}`,
      );
    }
  }
});

await runTest("ti robots hooks expose write flows and invalidate robots plus dashboard caches", async () => {
  const hookSource = await readModuleSource("hooks/useTiRobots.ts");
  const serviceSource = await readModuleSource("services/tiRobotsService.ts");
  const typeSource = await readModuleSource("types/robots.ts");

  for (const serviceMethod of [
    "listRobots",
    "createRobot",
    "getRobotById",
    "updateRobot",
    "createRobotRun",
    "listRobotRuns",
  ]) {
    assert.match(serviceSource, new RegExp(`${serviceMethod}\\s*\\(`));
  }

  assert.match(typeSource, /interface TiRobotPayload/);
  assert.match(typeSource, /interface TiRobotRunPayload/);
  assert.match(typeSource, /type\?: TiRobotType \| string/);
  assert.match(typeSource, /active\?: boolean/);
  assert.match(typeSource, /message\?: string/);
  assert.match(typeSource, /metadata_json\?: Record<string, unknown>/);
  assert.doesNotMatch(typeSource, /owner_id\?: TiId \| null/);
  assert.doesNotMatch(typeSource, /output\?: string \| null/);
  assert.doesNotMatch(typeSource, /error_message\?: string \| null/);
  assert.match(hookSource, /useMutation/);
  assert.match(hookSource, /useQueryClient/);

  for (const hookName of ["useCreateTiRobot", "useUpdateTiRobot", "useCreateTiRobotRun"]) {
    assert.match(hookSource, new RegExp(`function\\s+${hookName}\\s*\\(`));
  }

  assert.match(hookSource, /queryClient\.invalidateQueries\(\{\s*queryKey:\s*tiQueryKeys\.robots\.all\(\)/);
  assert.match(hookSource, /queryClient\.invalidateQueries\(\{\s*queryKey:\s*tiQueryKeys\.dashboard\(\)/);
  assert.match(hookSource, /queryClient\.invalidateQueries\(\{\s*queryKey:\s*tiQueryKeys\.robots\.detail\(variables\.id\)/);
  assert.match(hookSource, /queryClient\.invalidateQueries\(\{\s*queryKey:\s*tiQueryKeys\.robots\.runs\(variables\.id\)/);
});

await runTest("ti robots tab exposes operational list detail forms and run action", async () => {
  const tabSource = await readModuleSource("components/TiRobotsTab.tsx");

  assert.match(tabSource, /useTiRobots/);
  assert.match(tabSource, /useTiRobot\(/);
  assert.match(tabSource, /useTiRobotRuns/);
  assert.match(tabSource, /useCreateTiRobot/);
  assert.match(tabSource, /useUpdateTiRobot/);
  assert.match(tabSource, /useCreateTiRobotRun/);
  assert.match(tabSource, /Novo robô/);
  assert.match(tabSource, /Editar robô/);
  assert.match(tabSource, /Registrar execução/);
  assert.match(tabSource, /Dialog/);
  assert.match(tabSource, /TiNativeSelect/);
  assert.match(tabSource, /ROBOT_TYPE_OPTIONS/);
  assert.match(tabSource, /ROBOT_ACTIVE_FILTER_OPTIONS/);
  assert.match(tabSource, /type: draft\.type/);
  assert.match(tabSource, /active: draft\.active/);
  assert.match(tabSource, /message: draft\.message\.trim\(\)/);
  assert.match(tabSource, /Tempo gasto/);
  assert.match(tabSource, /placeholder="12 min ou 00:12:00"/);
  assert.match(tabSource, /durationTime/);
  assert.match(tabSource, /function parseDurationMs/);
  assert.match(tabSource, /12 min/);
  assert.match(tabSource, /00:12:00/);
  assert.match(tabSource, /durationMs/);
  assert.match(tabSource, /Sob demanda ou diariamente .* 02:00/);
  assert.match(tabSource, /Ex\.: sob demanda, diariamente .* 02:00 ou ap.* fechamento/);
  assert.match(tabSource, /Informe um tempo, por exemplo: 12 min ou 00:12:00/);
  assert.match(tabSource, /metadata_json: buildRunMetadata\(draft\)/);
  assert.match(tabSource, /finished_at: finishedAt/);
  assert.match(tabSource, /function buildRunPayload\(draft: RunDraft, finishedAt: string\)/);
  assert.doesNotMatch(tabSource, /owner_id: draft/);
  assert.doesNotMatch(tabSource, /output: draft/);
  assert.doesNotMatch(tabSource, /error_message: draft/);
  assert.doesNotMatch(tabSource, /Cron ou frequ.ncia/);
  assert.doesNotMatch(tabSource, /Metadados JSON/);
  assert.doesNotMatch(tabSource, /metadataJson/);
  assert.doesNotMatch(tabSource, /parseRunMetadataJson/);
  assert.doesNotMatch(tabSource, /ROBOT_SCHEDULE_OPTIONS/);
  assert.doesNotMatch(tabSource, /Rotina autom.tica/);
  assert.doesNotMatch(tabSource, /Agendamento personalizado/);
  assert.doesNotMatch(tabSource, /Agendamento/);
  assert.doesNotMatch(tabSource, /Frequ.ncia/);
  assert.doesNotMatch(tabSource, /Dura..o \(ms\)/);
  assert.doesNotMatch(tabSource, /durationMs: string/);
  assert.doesNotMatch(tabSource, /durationHours/);
  assert.doesNotMatch(tabSource, /durationMinutes/);
  assert.doesNotMatch(tabSource, /durationSeconds/);
  assert.doesNotMatch(tabSource, /function isInvalidScheduleSyntax/);
  assert.doesNotMatch(tabSource, /hasScheduleSyntaxWarning/);
  assert.doesNotMatch(tabSource, /agenda completa com 5 partes/);
  assert.doesNotMatch(tabSource, /Informe a execu..o prevista em texto ou use uma agenda v.lida/);
  assert.doesNotMatch(tabSource, /Informe o tempo gasto no formato 00:00:00/);
  assert.doesNotMatch(tabSource, /Di.rio 02:00, sob demanda ou conforme opera..o/);
  assert.match(tabSource, /activeRobotId/);
  assert.match(tabSource, /const selectedRobotId = activeRobotId/);
  assert.match(tabSource, /const \[isDetailDialogOpen, setIsDetailDialogOpen\] = useState\(false\)/);
  assert.match(tabSource, /setIsDetailDialogOpen\(true\)/);
  assert.match(tabSource, /Eye/);
  assert.match(tabSource, /label="Ver detalhes"/);
  assert.match(tabSource, /function openRobotDetail/);
  assert.match(tabSource, /function clearRobotSelection/);
  assert.match(tabSource, /function handleRobotsPanelClick/);
  assert.match(tabSource, /closest\("\[data-ti-robot-row\]"\)/);
  assert.match(tabSource, /closest\("\[data-ti-selection-control\]"\)/);
  assert.match(tabSource, /setActiveRobotId\(undefined\)/);
  assert.match(tabSource, /onClick=\{handleRobotsPanelClick\}/);
  assert.match(tabSource, /data-ti-robot-row/);
  assert.match(tabSource, /data-ti-selection-control/);
  assert.match(tabSource, /function handleDetailDialogOpenChange/);
  assert.doesNotMatch(tabSource, /setActiveRobotId\(savedRobot\.id\)/);
  const selectRobotBody = tabSource.match(
    /function selectRobot\(robotId: TiId\) \{[\s\S]*?\n  \}/,
  )?.[0] ?? "";
  const detailOpenChangeBody = tabSource.match(
    /function handleDetailDialogOpenChange\(nextOpen: boolean\) \{[\s\S]*?\n  \}/,
  )?.[0] ?? "";
  assert.doesNotMatch(selectRobotBody, /setIsDetailDialogOpen/);
  assert.doesNotMatch(detailOpenChangeBody, /clearRobotSelection/);
  assert.match(tabSource, /open=\{isDetailDialogOpen\}/);
  assert.match(tabSource, /title=\{activeRobot \? getRobotName\(activeRobot\) : "Detalhe do robô"\}/);
  assert.match(tabSource, /aria-label="Hist.*rico de execu.*es do rob.*"/);
  assert.match(tabSource, /role="list"/);
  assert.match(tabSource, /role="listitem"/);
  assert.match(tabSource, /tiThinScrollbarClassName/);
  assert.match(tabSource, /line-clamp-2/);
  assert.match(tabSource, /function getLatestRunDate/);
  assert.match(tabSource, /function getLatestDateValue/);
  assert.match(tabSource, /latestSelectedRunAt/);
  assert.match(tabSource, /lastRunOverrides/);
  assert.match(tabSource, /setLastRunOverrides/);
  assert.match(tabSource, /const finishedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(tabSource, /payload: buildRunPayload\(runDraft, finishedAt\)/);
  assert.match(tabSource, /getRunDate\(createdRun\) \?\? finishedAt/);
  assert.match(tabSource, /getRobotLastRunAt/);
  assert.match(tabSource, /latestSelectedRunAt \?\? activeRobot\.last_run_at/);
  assert.match(tabSource, /function formatSchedule/);
  assert.match(tabSource, /Execu..o prevista/);
  assert.doesNotMatch(tabSource, />Agenda<\//);
  assert.doesNotMatch(tabSource, /robots\[0\]\?\.id/);
  assert.doesNotMatch(tabSource, /<aside/);
  assert.match(tabSource, /handleRobotRowKeyDown/);
  assert.match(tabSource, /role="button"/);
  assert.match(tabSource, /tabIndex=\{0\}/);
  assert.match(tabSource, /aria-selected=\{isActive\}/);
  assert.match(tabSource, /actionError/);
  assert.match(tabSource, /robotsQuery\.isError/);
  assert.match(tabSource, /runsQuery\.isError/);
  assert.match(tabSource, /mutateAsync/);
  assert.doesNotMatch(tabSource, /api\.(get|post|patch|put|delete)\(/);
});

await runTest("ti robots filters normalize empty values before query state", async () => {
  const tabSource = await readModuleSource("components/TiRobotsTab.tsx");

  assert.match(tabSource, /function normalizeRobotFilters/);
  assert.match(tabSource, /const normalizedFilters = useMemo\(\(\) => normalizeRobotFilters\(filters\), \[filters\]\)/);
  assert.match(tabSource, /useTiRobots\(normalizedFilters\)/);
  assert.match(tabSource, /type: value/);
  assert.match(tabSource, /active: value/);
  assert.doesNotMatch(tabSource, /search: value/);
  assert.match(tabSource, /value !== ""/);
});

await runTest("ti automation metrics stay inside the robots tab for this PR", async () => {
  const tabSource = await readModuleSource("components/TiRobotsTab.tsx");
  const dashboardSource = await readModuleSource("components/TiDashboardTab.tsx");
  const dashboardTypeSource = await readModuleSource("types/dashboard.ts");

  assert.match(tabSource, /automationMetrics/);
  assert.match(tabSource, /Robôs ativos/);
  assert.match(tabSource, /Execuções do robô/);
  assert.match(tabSource, /Falhas do robô/);
  assert.match(tabSource, /isRobotActive/);
  assert.match(tabSource, /isFailedRun/);
  assert.doesNotMatch(dashboardSource, /robot_runs_recent/);
  assert.doesNotMatch(dashboardSource, /robot_runs_failed/);
  assert.doesNotMatch(dashboardTypeSource, /robot_runs_recent\?: number/);
  assert.doesNotMatch(dashboardTypeSource, /robot_runs_failed\?: number/);
  assert.doesNotMatch(dashboardSource, /api\.(get|post|patch|put|delete)\(/);
});
