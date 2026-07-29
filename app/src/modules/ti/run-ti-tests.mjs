import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = fileURLToPath(new URL("./", import.meta.url));
const appRoot = join(moduleRoot, "../../..");
const moduleRootRelative = "src/modules/ti";
const testPattern = process.env.TI_TEST_PATTERN;

async function runTest(name, fn) {
  if (testPattern && !name.includes(testPattern)) {
    return;
  }

  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await runTest("ti request message attachments accept supported images without trusting arbitrary URL hosts", async () => {
  const {
    MAX_TI_REQUEST_MESSAGE_IMAGE_BYTES,
    validateTiRequestMessageImage,
  } = await import("./utils/requestMessageAttachment.ts");

  assert.equal(MAX_TI_REQUEST_MESSAGE_IMAGE_BYTES, 5 * 1024 * 1024);
  assert.equal(
    validateTiRequestMessageImage({
      type: "image/png",
      size: MAX_TI_REQUEST_MESSAGE_IMAGE_BYTES,
    }),
    null,
  );
  assert.equal(
    validateTiRequestMessageImage({ type: "image/gif", size: 10 }),
    "Selecione uma imagem PNG, JPEG ou WebP.",
  );
  assert.equal(
    validateTiRequestMessageImage({
      type: "image/webp",
      size: MAX_TI_REQUEST_MESSAGE_IMAGE_BYTES + 1,
    }),
    "A imagem deve ter no máximo 5 MB.",
  );
});

await runTest("ti request messages use multipart only when an image is attached", async () => {
  const { buildTiRequestMessageSubmission } = await import(
    "./utils/requestMessageAttachment.ts"
  );
  const attachment = new File(["test image"], "evidence.png", { type: "image/png" });

  const multipartSubmission = buildTiRequestMessageSubmission({
    message: "Segue a evidência.",
    attachment,
  });

  assert.equal(multipartSubmission instanceof FormData, true);
  assert.equal(multipartSubmission.get("message"), "Segue a evidência.");
  assert.equal(multipartSubmission.get("file"), attachment);

  assert.deepEqual(buildTiRequestMessageSubmission({ message: "Mensagem sem anexo." }), {
    message: "Mensagem sem anexo.",
  });
});

await runTest("ti request message uploads prefer domain errors and hide technical Axios messages", async () => {
  const { getTiRequestMessageActionError } = await import(
    "./utils/requestMessageAttachment.ts"
  );

  assert.equal(
    getTiRequestMessageActionError({
      message: "Request failed with status code 413",
      response: { data: { error: "A imagem excede o limite permitido." } },
    }),
    "A imagem excede o limite permitido.",
  );
  assert.equal(
    getTiRequestMessageActionError(new Error("Request failed with status code 500")),
    "Não foi possível enviar a mensagem. Tente novamente.",
  );
});

await runTest("ti request attachment UI retains the accessible upload flow and clears context-bound drafts", async () => {
  const requestsTabSource = await readModuleSource("components/TiRequestsTab.tsx");

  assert.match(requestsTabSource, /type="file"/);
  assert.match(requestsTabSource, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(requestsTabSource, /focus-within:ring-2/);
  assert.match(requestsTabSource, /onChange=\{handleMessageAttachmentChange\}/);
  assert.match(requestsTabSource, /URL\.createObjectURL\(messageAttachment\)/);
  assert.match(requestsTabSource, /URL\.revokeObjectURL\(previewUrl\)/);
  assert.match(requestsTabSource, /alt=\{`Prévia de \$\{messageAttachment\.name\}`\}/);
  assert.match(requestsTabSource, /onClick=\{handleRemoveMessageAttachment\}/);
  assert.match(requestsTabSource, /disabled=\{createMessageMutation\.isPending\}/);
  assert.doesNotMatch(requestsTabSource, /getTiRequestMessageAttachmentUrl\(/);
  assert.match(requestsTabSource, /target="_blank"/);
  assert.match(requestsTabSource, /rel="noreferrer"/);
  assert.match(requestsTabSource, /toast\.error\(validationError\)/);
  assert.match(requestsTabSource, /toast\.error\(feedback\)/);
  assert.match(
    requestsTabSource,
    /function resetMessageComposer\(\) \{[\s\S]*setMessageDraft\(""\);[\s\S]*setMessageAttachment\(null\);[\s\S]*setActionError\(null\);[\s\S]*\}/,
  );
  assert.match(requestsTabSource, /if \(!nextOpen\) \{[\s\S]*resetMessageComposer\(\);/);
  assert.match(
    requestsTabSource,
    /onClick=\{\(\) => \{[\s\S]*resetMessageComposer\(\);[\s\S]*setSelectedRequestId\(request\.id\);/,
  );
});

async function readModuleSource(relativePath) {
  return readFile(join(moduleRoot, relativePath), "utf8");
}

async function readAppSource(relativePath) {
  return readFile(join(appRoot, relativePath), "utf8");
}

async function readWorkspaceSource(relativePath) {
  return readFile(join(appRoot, "..", relativePath), "utf8");
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

await runTest("issue 509 ti robot form utilities preserve validation and payload semantics", async () => {
  const {
    buildCreateRobotPayload,
    buildUpdateRobotPayload,
    getFirstInvalidRobotField,
    getRobotMutationErrorMessage,
    validateRobotDraft,
  } = await import("./utils/robotForm.ts");

  const emptyDraft = {
    name: "   ",
    description: "   ",
    type: "",
    status: "active",
    active: true,
    schedule: "   ",
  };

  assert.deepEqual(validateRobotDraft(emptyDraft), {
    name: "Informe o nome do robô.",
    type: "Selecione o tipo do robô.",
  });
  assert.deepEqual(
    validateRobotDraft({ ...emptyDraft, name: "Backup diário" }),
    { type: "Selecione o tipo do robô." },
  );
  assert.equal(
    getFirstInvalidRobotField(validateRobotDraft(emptyDraft)),
    "name",
  );
  assert.equal(
    getFirstInvalidRobotField(
      validateRobotDraft({ ...emptyDraft, name: "Backup diário" }),
    ),
    "type",
  );

  const validDraft = {
    ...emptyDraft,
    name: "  Backup diário  ",
    type: "Backup",
  };
  assert.deepEqual(validateRobotDraft(validDraft), {});
  assert.deepEqual(buildCreateRobotPayload(validDraft), {
    name: "Backup diário",
    type: "Backup",
    status: "active",
    active: true,
  });
  assert.deepEqual(buildUpdateRobotPayload(validDraft), {
    name: "Backup diário",
    description: null,
    type: "Backup",
    status: "active",
    active: true,
    schedule: null,
  });

  const filledDraft = {
    ...validDraft,
    description: "  Arquivos internos  ",
    schedule: "  diariamente às 02:00  ",
  };
  assert.deepEqual(buildCreateRobotPayload(filledDraft), {
    name: "Backup diário",
    description: "Arquivos internos",
    type: "Backup",
    status: "active",
    active: true,
    schedule: "diariamente às 02:00",
  });

  const responseError = Object.assign(new Error("Request failed with status code 400"), {
    response: {
      data: {
        error: "Selecione o tipo do robô.",
        message: "Mensagem secundária.",
      },
    },
  });
  assert.equal(
    getRobotMutationErrorMessage(responseError),
    "Selecione o tipo do robô.",
  );
  assert.equal(
    getRobotMutationErrorMessage({ response: { data: { message: "Falha legível da API." } } }),
    "Falha legível da API.",
  );
  assert.equal(
    getRobotMutationErrorMessage(new Error("Falha legível do cliente.")),
    "Falha legível do cliente.",
  );
  assert.equal(
    getRobotMutationErrorMessage({}),
    "Não foi possível concluir a ação.",
  );

  const typeSource = await readModuleSource("types/robots.ts");
  const payloadTypeSource =
    typeSource.match(/export interface TiRobotPayload \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(payloadTypeSource, /name: string/);
  assert.match(payloadTypeSource, /type: TiRobotType \| string/);
  assert.doesNotMatch(payloadTypeSource, /name\?: string/);
  assert.doesNotMatch(payloadTypeSource, /type\?: TiRobotType \| string/);
});

await runTest("issue 509 ti robot dialog exposes accessible required field errors", async () => {
  const tabSource = await readModuleSource("components/TiRobotsTab.tsx");

  assert.match(tabSource, /useEffect/);
  assert.match(tabSource, /useRef/);
  assert.match(tabSource, /type: ""/);
  assert.match(
    tabSource,
    /\{\s*value: "",\s*label: "Selecione o tipo",\s*disabled: true\s*\}/,
  );
  assert.match(tabSource, /validateRobotDraft\(robotDraft\)/);
  assert.match(tabSource, /getFirstInvalidRobotField\(nextFieldErrors\)/);
  assert.match(tabSource, /buildCreateRobotPayload\(robotDraft\)/);
  assert.match(tabSource, /buildUpdateRobotPayload\(robotDraft\)/);
  assert.match(tabSource, /getRobotMutationErrorMessage\(error\)/);
  assert.match(tabSource, /robotFormRef\.current\?\.elements\.namedItem\(focusField\)/);
  assert.match(tabSource, /control\.focus\(\)/);
  assert.match(tabSource, /setFocusField\(null\)/);
  assert.match(tabSource, /ref=\{robotFormRef\}/);
  assert.match(tabSource, /noValidate/);
  assert.match(tabSource, /id="ti-robot-name"/);
  assert.match(tabSource, /name="name"/);
  assert.match(tabSource, /id="ti-robot-type"/);
  assert.match(tabSource, /name="type"/);
  assert.match(tabSource, /htmlFor="ti-robot-type"/);
  assert.match(tabSource, /required/);
  assert.match(tabSource, /aria-invalid=\{Boolean\(fieldErrors\.name\)\}/);
  assert.match(tabSource, /aria-invalid=\{Boolean\(fieldErrors\.type\)\}/);
  assert.match(tabSource, /aria-describedby=\{fieldErrors\.name/);
  assert.match(tabSource, /aria-describedby=\{fieldErrors\.type/);
  assert.match(tabSource, /id="ti-robot-name-error"/);
  assert.match(tabSource, /id="ti-robot-type-error"/);
  assert.match(tabSource, /role="alert"/);
  assert.match(tabSource, /clearRobotFieldError\("name"\)/);
  assert.match(tabSource, /clearRobotFieldError\("type"\)/);
});

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

await runTest("ti stock mutation error preserves the domain message returned by the API", async () => {
  const { getTiStockMutationErrorMessage } = await import("./utils/stockMutationError.ts");
  const axiosStyleError = {
    isAxiosError: true,
    message: "Request failed with status code 409",
    response: {
      status: 409,
      data: {
        success: false,
        error: "Saldo insuficiente no estoque de TI.",
        code: "CONFLICT",
      },
    },
  };

  const message = getTiStockMutationErrorMessage(
    axiosStyleError,
    "Não foi possível registrar a saída.",
  );

  assert.equal(message, "Saldo insuficiente no estoque de TI.");
  assert.notEqual(message, "Request failed with status code 409");
});

await runTest("ti stock mutation error rejects a technical API error message for a 409", async () => {
  const { getTiStockMutationErrorMessage } = await import("./utils/stockMutationError.ts");
  const axiosStyleError = {
    isAxiosError: true,
    message: "Request failed with status code 409",
    response: {
      status: 409,
      data: {
        success: false,
        error: "Request failed with status code 409",
        code: "CONFLICT",
      },
    },
  };

  const message = getTiStockMutationErrorMessage(
    axiosStyleError,
    "Não foi possível registrar a saída.",
  );

  assert.equal(message, "Não foi possível registrar a saída: o saldo disponível é insuficiente.");
  assert.notEqual(message, "Request failed with status code 409");
});

await runTest("ti stock mutation error uses an actionable fallback for a 409 without domain message", async () => {
  const { getTiStockMutationErrorMessage } = await import("./utils/stockMutationError.ts");
  const axiosStyleError = {
    isAxiosError: true,
    message: "Request failed with status code 409",
    response: {
      status: 409,
      data: {
        success: false,
        error: "   ",
        code: "CONFLICT",
      },
    },
  };

  const message = getTiStockMutationErrorMessage(
    axiosStyleError,
    "Não foi possível registrar a saída.",
  );

  assert.equal(message, "Não foi possível registrar a saída: o saldo disponível é insuficiente.");
  assert.notEqual(message, "Request failed with status code 409");
});

await runTest("ti stock exit feedback uses the scoped mutation error normalizer", async () => {
  const tabSource = await readModuleSource("components/TiStockTab.tsx");
  const exitHandlerStart = tabSource.indexOf("async function handleSubmitExit");
  const exitHandlerEnd = tabSource.indexOf("async function handleSubmitCategory", exitHandlerStart);
  const exitHandlerSource = tabSource.slice(exitHandlerStart, exitHandlerEnd);

  assert.match(
    tabSource,
    /import \{ getTiStockMutationErrorMessage \} from "\.\.\/utils\/stockMutationError"/,
  );
  assert.match(
    exitHandlerSource,
    /getTiStockMutationErrorMessage\(error, "Não foi possível registrar a saída\."\)/,
  );
});

await runTest("ti stock category dialog filters matches and makes new category creation explicit", async () => {
  const tabSource = await readModuleSource("components/TiStockTab.tsx");

  assert.match(tabSource, /function normalizeStockCategoryName\(value: unknown\): string/);
  assert.match(tabSource, /const normalizedCategorySearch = normalizeStockCategoryName\(categoryName\)/);
  assert.match(tabSource, /const filteredStockCategories = useMemo\(/);
  assert.match(
    tabSource,
    /stockCategories\.filter\(\(category\) =>\s*normalizeStockCategoryName\(category\.name\)\.includes\(normalizedCategorySearch\)/,
  );
  assert.match(tabSource, /const hasExactCategoryName = stockCategories\.some\(/);
  assert.match(tabSource, /rows=\{filteredStockCategories\}/);
  assert.match(tabSource, /Nenhuma categoria correspondente\. Você pode criar uma nova categoria\./);
  assert.match(tabSource, /disabled=\{!canEditStock \|\| createCategoryMutation\.isPending \|\| hasExactCategoryName\}/);
});

await runTest("ti stock locations filter progressively and identify normalized active duplicates", async () => {
  const tabSource = await readModuleSource("components/TiStockTab.tsx");
  const {
    filterTiStockLocations,
    hasActiveTiStockLocation,
    normalizeTiStockLocationName,
  } = await import("./utils/stockDisplay.ts");
  const locations = [
    { id: 1, name: "Almoxarifado São", status: true },
    { id: 2, name: "Sala de reuniões", status: true },
    { id: 3, name: "Almoxarifado antigo", status: false },
  ];

  assert.equal(typeof normalizeTiStockLocationName, "function");
  assert.equal(normalizeTiStockLocationName("  Almoxarifado   São  "), "almoxarifado sao");
  assert.deepEqual(
    filterTiStockLocations(locations, "almox"),
    [locations[0], locations[2]],
  );
  assert.equal(hasActiveTiStockLocation(locations, "ALMOXARIFADO SAO"), true);
  assert.equal(hasActiveTiStockLocation(locations, "Sala"), false);
  assert.match(tabSource, /hasActiveTiStockLocation\(stockLocations, name\)/);
  assert.match(tabSource, /rows=\{filteredStockLocations\}/);
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
  assert.match(controlsSource, /type TiListQueryData<T> = T\[\] \| \{ items\?: T\[\] \}/);
  assert.doesNotMatch(controlsSource, /UseQueryResult/);
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

await runTest("ti password deactivation exposes typed lifecycle contract", async () => {
  const typesSource = await readModuleSource("types/passwords.ts");
  const serviceSource = await readModuleSource("services/tiPasswordsService.ts");
  const hookSource = await readModuleSource("hooks/useTiPasswords.ts");
  const listInterfaceSource = typesSource.slice(
    typesSource.indexOf("export interface TiPasswordListItem"),
    typesSource.indexOf("export interface TiPasswordDetail"),
  );
  const listFiltersSource = typesSource.slice(
    typesSource.indexOf("export type TiPasswordListFilters"),
    typesSource.indexOf("export interface TiPasswordUser"),
  );
  const listServiceSource = serviceSource.slice(
    serviceSource.indexOf("async listPasswords"),
    serviceSource.indexOf("async createPassword"),
  );
  const listHookSource = hookSource.slice(
    hookSource.indexOf("export function useTiPasswords"),
    hookSource.indexOf("export function useTiPassword("),
  );

  assert.match(typesSource, /export type TiPasswordStatusFilter = "active" \| "inactive" \| "all"/);
  assert.match(listFiltersSource, /status\?: TiPasswordStatusFilter/);
  assert.match(listInterfaceSource, /active: boolean/);
  assert.match(listInterfaceSource, /deactivated_at\?: string \| null/);
  assert.match(listInterfaceSource, /deactivated_by_user_id\?: TiId \| null/);
  assert.match(listInterfaceSource, /deactivation_reason\?: string \| null/);
  assert.match(typesSource, /export interface TiPasswordDeactivatePayload/);
  assert.match(typesSource, /reason: string/);
  assert.match(listHookSource, /filters\?: TiPasswordListFilters/);
  assert.match(listHookSource, /tiPasswordsService\.listPasswords\(filters\)/);
  assert.match(listServiceSource, /filters\?: TiPasswordListFilters/);
  assert.match(listServiceSource, /params: buildTiListParams\(filters\)/);
});

await runTest("ti password deactivation uses the centralized endpoint and safe payload", async () => {
  const contractSource = await readModuleSource("services/tiService.contract.ts");
  const serviceSource = await readModuleSource("services/tiPasswordsService.ts");
  const deactivateServiceSource = serviceSource.slice(
    serviceSource.indexOf("async deactivatePassword"),
  );

  assert.match(contractSource, /deactivate: "\/ti\/passwords\/\{id\}\/deactivate"/);
  assert.match(deactivateServiceSource, /async deactivatePassword\(/);
  assert.match(
    deactivateServiceSource,
    /api\.post<TiEnvelope<TiPasswordListItem>>\(\s*buildTiPath\(TI_ENDPOINTS\.passwords\.deactivate, id\),\s*\{ reason: payload\.reason \},/,
  );
  assert.doesNotMatch(
    deactivateServiceSource,
    /buildTiPath\(TI_ENDPOINTS\.passwords\.deactivate, id\),\s*payload/,
  );
});

await runTest("ti password deactivation mutation evicts detail and invalidates lists", async () => {
  const hookSource = await readModuleSource("hooks/useTiPasswords.ts");
  const deactivateVariablesStart = hookSource.indexOf("export type TiPasswordDeactivateVariables");
  const deactivateVariablesEnd = hookSource.indexOf(
    "\n\nexport function useTiPasswords",
    deactivateVariablesStart,
  );
  const deactivateVariablesSource = hookSource.slice(
    deactivateVariablesStart,
    deactivateVariablesEnd,
  );
  const deactivateHookStart = hookSource.indexOf("export function useDeactivateTiPasswordMutation");
  const deactivateHookEnd = hookSource.indexOf("\n}", deactivateHookStart) + 2;
  const deactivateHookSource = hookSource.slice(
    deactivateHookStart,
    deactivateHookEnd,
  );

  assert.notEqual(deactivateVariablesStart, -1);
  assert.notEqual(deactivateVariablesEnd, -1);
  assert.notEqual(deactivateHookStart, -1);
  assert.notEqual(deactivateHookEnd, 1);
  assert.match(
    deactivateVariablesSource,
    /export type TiPasswordDeactivateVariables = \{\s*id: TiId;\s*payload: TiPasswordDeactivatePayload;\s*\}/,
  );
  assert.doesNotMatch(deactivateVariablesSource, /export function/);
  assert.equal([...deactivateHookSource.matchAll(/export function/g)].length, 1);
  assert.match(
    deactivateHookSource,
    /UseMutationResult<\s*TiPasswordListItem,\s*Error,\s*TiPasswordDeactivateVariables\s*>/,
  );
  assert.match(deactivateHookSource, /return useMutation\(/);
  assert.match(
    deactivateHookSource,
    /mutationFn: \(\{ id, payload \}\) => tiPasswordsService\.deactivatePassword\(id, payload\)/,
  );
  assert.match(
    deactivateHookSource,
    /queryClient\.removeQueries\(\{\s*queryKey: tiQueryKeys\.passwords\.detail\(variables\.id\),\s*exact: true,?\s*\}\)/,
  );
  assert.match(
    deactivateHookSource,
    /queryClient\.invalidateQueries\(\{\s*queryKey: tiQueryKeys\.passwords\.all\(\),?\s*\}\)/,
  );
  assert.doesNotMatch(deactivateHookSource, /setQueryData\(\s*tiQueryKeys\.passwords\.detail/);
});

await runTest("ti password administration is admin-only and defaults to active", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(tabSource, /const canManagePasswords = access\.isAdmin/);
  assert.match(
    tabSource,
    /useState<TiPasswordListFilters>\(\{\s*status: "active",\s*page: 1,\s*page_size: PASSWORD_PAGE_SIZE/,
  );
  assert.match(tabSource, /useTiPasswords\(filters, \{ enabled: canManagePasswords \}\)/);
  assert.match(tabSource, /value: "active", label: "Ativas"/);
  assert.match(tabSource, /value: "inactive", label: "Inativas"/);
  assert.match(tabSource, /value: "all", label: "Todas"/);
  assert.match(tabSource, /page: 1/);
});

await runTest("ti password inactive rows expose metadata without secret actions", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(tabSource, /const isActive = item\.active !== false/);
  assert.match(tabSource, /<StatusBadge/);
  assert.match(tabSource, /label: isActive \? "Ativa" : "Inativa"/);
  assert.match(tabSource, /deactivation_reason/);
  assert.match(tabSource, /isActive \? \(/);
  assert.match(tabSource, /label="Inativar"/);
  assert.doesNotMatch(tabSource, /setRevealPasswordId\(item\.id\)[\s\S]*item\.active === false/);
});

await runTest("ti password deactivation dialog requires reason and warns about external access", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(tabSource, /const \[deactivatingPassword, setDeactivatingPassword\]/);
  assert.match(tabSource, /const \[deactivationReason, setDeactivationReason\]/);
  assert.match(tabSource, /deactivationReason\.trim\(\)/);
  assert.match(tabSource, /maxLength=\{500\}/);
  assert.match(tabSource, /Inativar credencial/);
  assert.match(
    tabSource,
    /inativar este registro no Giro Office[\s\S]*não revoga nem altera a senha no sistema externo/i,
  );
  assert.match(tabSource, /clearPasswordRevealCache\(deactivatingPassword\.id\)/);
  assert.match(tabSource, /setRevealPasswordId\(null\)/);
  assert.match(tabSource, /toast\.success\("Credencial inativada\."\)/);
});

await runTest("ti password reveal cleanup cancels cache on permission loss and unmount", async () => {
  const hookSource = await readModuleSource("hooks/useTiPasswords.ts");
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(hookSource, /import \{ useCallback \} from "react"/);
  assert.match(
    hookSource,
    /return useCallback\(\s*\(id\) => \{[\s\S]*?queryClient\.cancelQueries\(\{\s*queryKey: tiQueryKeys\.passwords\.detail\(id\),\s*exact: true,?\s*\}\);[\s\S]*?queryClient\.removeQueries\(\{\s*queryKey: tiQueryKeys\.passwords\.detail\(id\),\s*exact: true,?\s*\}\);[\s\S]*?\},\s*\[queryClient\],?\s*\)/,
  );
  assert.match(
    tabSource,
    /useEffect\(\(\) => \{\s*if \(!canRevealPasswords && revealPasswordId\) \{\s*clearPasswordRevealCache\(revealPasswordId\);\s*setRevealPasswordId\(null\);\s*\}\s*return \(\) => \{\s*clearPasswordRevealCache\(revealPasswordId\);\s*\};\s*\}, \[canRevealPasswords, clearPasswordRevealCache, revealPasswordId\]\)/,
  );
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
  assert.match(tabSource, /headers=\{\["Local", "Usuário", "Notas", ""\]\}/);
  assert.match(tabSource, /open=\{Boolean\(revealPasswordId\)\}/);
  assert.match(tabSource, /title="Revelar senha"/);
  assert.doesNotMatch(tabSource, /"Segredo"/);
  assert.doesNotMatch(tabSource, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(280px,360px\)\]/);
  assert.doesNotMatch(tabSource, /\.map\(\(item[^]*?item\.password[^]*?\)\)/);
  assert.doesNotMatch(tabSource, /passwordRows[^]*?\.password/);
});

await runTest("ti passwords tab keeps create edit flows in a dialog and searches paginated results", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");
  const dialogSource = await readAppSource("src/shared/components/ui/Dialog.tsx");

  assert.match(tabSource, /import \{ Dialog \} from "@shared\/components\/ui\/Dialog"/);
  assert.match(tabSource, /const PASSWORD_PAGE_SIZE = \d+/);
  assert.match(tabSource, /const PASSWORD_SEARCH_DEBOUNCE_MS = \d+/);
  assert.match(tabSource, /const \[filters, setFilters\] = useState<TiPasswordListFilters>\(\{\s*status: "active",\s*page: 1,\s*page_size: PASSWORD_PAGE_SIZE,\s*\}\)/);
  assert.match(tabSource, /const \[searchDraft, setSearchDraft\] = useState\(""\)/);
  assert.match(tabSource, /const \[isPasswordDialogOpen, setIsPasswordDialogOpen\] = useState\(false\)/);
  assert.match(tabSource, /useEffect\(\(\) => \{/);
  assert.match(tabSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(tabSource, /PASSWORD_SEARCH_DEBOUNCE_MS/);
  assert.match(tabSource, /window\.clearTimeout\(timeoutId\)/);
  assert.match(tabSource, /search: toOptionalText\(searchDraft\)/);
  assert.match(tabSource, /page: 1/);
  assert.match(tabSource, /page_size: PASSWORD_PAGE_SIZE/);
  assert.match(tabSource, /aria-label="Filtros de senhas"/);
  assert.match(tabSource, /label="Buscar por local, usuário ou notas"/);
  assert.match(tabSource, /placeholder="Local, usuário ou notas"/);
  assert.match(tabSource, /pageInfoText/);
  assert.match(tabSource, /onClick=\{\(\) => setPasswordPage\(currentPasswordPage - 1\)\}/);
  assert.match(tabSource, /onClick=\{\(\) => setPasswordPage\(currentPasswordPage \+ 1\)\}/);
  assert.match(tabSource, /open=\{isPasswordDialogOpen\}/);
  assert.match(tabSource, /title=\{editingPassword \? "Editar senha" : "Nova senha"\}/);
  assert.doesNotMatch(dialogSource, /@shared\/ui\/newLayout\/utils/);
  assert.doesNotMatch(dialogSource, /contentClassName,\s*\)\}/);
  assert.match(tabSource, /aria-label="Conteúdo de senhas"/);
  assert.match(tabSource, /<form className="space-y-2" onSubmit=\{handleSubmitPassword\}>/);
  assert.match(tabSource, /onClick=\{openCreateForm\}/);
  assert.doesNotMatch(tabSource, /<span>Buscar<\/span>/);
  assert.doesNotMatch(tabSource, /onSubmit=\{applyPasswordFilters\}/);
  assert.doesNotMatch(
    tabSource,
    /<form className="space-y-2" onSubmit=\{handleSubmitPassword\}>[\s\S]*?className="grid gap-3 md:grid-cols-2"/,
  );
  assert.doesNotMatch(
    tabSource,
    /<form\s+className=\{`\$\{tiCardClassName\} space-y-3`\}\s+onSubmit=\{handleSubmitPassword\}/,
  );
});

await runTest("ti password reveal copy uses copy icon without toggling visibility", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(tabSource, /Copy,/);
  assert.match(tabSource, /<Copy className="h-4 w-4" \/>/);
  assert.match(tabSource, /const copied = await copySensitiveText\(secret, clipboard\)/);
  assert.doesNotMatch(tabSource, /navigator\.clipboard\.writeText\(secret\)/);
  assert.doesNotMatch(tabSource, /<EyeOff className="h-4 w-4" \/>[\s\S]*?<span>Copiar senha<\/span>/);
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

await runTest("ti user selects reuse the operational users source", async () => {
  const hookSource = await readAppSource("src/modules/rh/hooks/useAssignableUsers.ts");
  const rhTypesSource = await readAppSource("src/modules/rh/types.ts");
  const userTypesSource = await readAppSource("src/modules/users/types/index.ts");

  assert.match(hookSource, /api\.get\(RH_ENDPOINTS\.operationalUsers\)/);
  assert.match(hookSource, /unwrapRhEnvelope<RhOperationalUser\[\]>/);
  assert.doesNotMatch(hookSource, /cpf: user\.cpf \?\? null/);
  assert.doesNotMatch(rhTypesSource, /cpf\?: string \| null/);
  assert.doesNotMatch(userTypesSource, /cpf\?: string \| null/);
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

await runTest("ti extension numbers use an exact four-digit contract", async () => {
  const {
    TI_EXTENSION_NUMBER_LENGTH,
    isValidTiExtensionNumber,
    sanitizeTiExtensionNumber,
  } = await import("./utils/extensionNumber.ts");

  assert.equal(TI_EXTENSION_NUMBER_LENGTH, 4);
  assert.equal(isValidTiExtensionNumber("1001"), true);
  assert.equal(isValidTiExtensionNumber("0007"), true);

  for (const invalid of ["", "123", "12345", "12A4", "12-4", " 1234 "]) {
    assert.equal(isValidTiExtensionNumber(invalid), false);
  }

  assert.equal(sanitizeTiExtensionNumber("12A4"), "124");
  assert.equal(sanitizeTiExtensionNumber("12-34-56"), "1234");
});

await runTest("ti extension form validates digits and hides the internal id", async () => {
  const tabSource = await readModuleSource("components/TiExtensionsTab.tsx");

  assert.match(
    tabSource,
    /import \{[\s\S]*TI_EXTENSION_NUMBER_LENGTH,[\s\S]*isValidTiExtensionNumber,[\s\S]*sanitizeTiExtensionNumber,[\s\S]*\} from "\.\.\/utils\/extensionNumber"/,
  );
  assert.equal([...tabSource.matchAll(/isValidTiExtensionNumber\(number\)/g)].length, 2);
  assert.equal(
    [
      ...tabSource.matchAll(
        /toast\.error\("Informe um ramal com exatamente 4 dígitos\."\)/g,
      ),
    ].length,
    2,
  );
  assert.match(tabSource, /inputMode="numeric"/);
  assert.match(tabSource, /maxLength=\{TI_EXTENSION_NUMBER_LENGTH\}/);
  assert.match(
    tabSource,
    /updateExtensionField\(\s*"number",\s*sanitizeTiExtensionNumber\(event\.target\.value\),?\s*\)/,
  );
  assert.doesNotMatch(tabSource, /<TiFieldLine label="ID"/);
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
  assert.match(
    tabSource,
    /const canManageExtensions = access\.canEdit \|\| access\.isAdmin/,
  );
  assert.match(
    tabSource,
    /assignableUsersQuery = useAssignableUsers\(\{ enabled: canManageExtensions \}\)/,
  );
  assert.match(tabSource, /\{!canManageExtensions \? \(/);
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

await runTest("ti shell exposes ramais but hides sensitive tabs for self-service users", async () => {
  const pageSource = await readModuleSource("components/TiPage.tsx");
  const selfServiceTabsSource =
    pageSource.match(/const SELF_SERVICE_TI_TABS[\s\S]*?\n\];/)?.[0] ?? "";

  assert.match(pageSource, /SELF_SERVICE_TI_TABS/);
  assert.match(pageSource, /const canManageTi = access\.isAdmin/);
  assert.match(pageSource, /const visibleTabs = canManageTi \? TI_TABS : SELF_SERVICE_TI_TABS/);
  assert.match(selfServiceTabsSource, /id: "dashboard"/);
  assert.match(selfServiceTabsSource, /id: "extensions"[\s\S]*label: "Ramais"/);
  assert.match(selfServiceTabsSource, /label: "Meus termos"/);

  for (const sensitiveTabId of ["inventory", "stock", "passwords", "robots"]) {
    assert.doesNotMatch(selfServiceTabsSource, new RegExp(`id: "${sensitiveTabId}"`));
  }
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

await runTest("issue 495 ti request messages preserve line breaks and wrap long text", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");
  const messageDisplay =
    tabSource.match(
      /<p className="[^"]*">\s*\{message\.message \?\? getStringField\(message, \["content", "body"\], ""\)\}\s*<\/p>/,
    )?.[0] ?? "";

  assert.match(messageDisplay, /whitespace-pre-wrap/);
  assert.match(messageDisplay, /break-words/);
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

await runTest("ti request categories are managed by users and hidden from viewers", async () => {
  const tabSource = await readModuleSource("components/TiRequestsTab.tsx");

  assert.match(tabSource, /const canManageCategories = access\.canEdit/);
  assert.match(tabSource, /\{canManageCategories \? \(/);
  assert.match(tabSource, /label="Categorias"/);
  assert.match(tabSource, /open=\{isCategoryDialogOpen\}/);
  assert.match(tabSource, /categoriesQuery\.data \?\? \[\]/);
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
  assert.match(tabSource, /summary\?\.scope === "self"/);
  assert.match(tabSource, /openRequests/);
  assert.match(tabSource, /criticalRequests/);
  assert.match(tabSource, /resolvedLastSevenDays/);
  assert.match(tabSource, /closedRequests/);
  assert.match(tabSource, /Não foi possível carregar seu resumo de chamados\. Tente novamente\./);
  assert.match(tabSource, /inventoryAssets/);
  assert.match(tabSource, /lowStockItems/);
  assert.match(tabSource, /activeRobots/);
  assert.match(dashboardTypesSource, /scope: "self"/);
  assert.match(dashboardTypesSource, /scope: "organization"/);
  assert.match(dashboardTypesSource, /openRequests: number/);
  assert.match(dashboardTypesSource, /closedRequests: number/);
  assert.match(dashboardTypesSource, /inventoryAssets: number/);
  assert.doesNotMatch(tabSource, /requests_open/);
  assert.doesNotMatch(tabSource, /inventory_total/);
  assert.match(tabSource, /isLoading|isFetching/);
  assert.match(tabSource, /isError/);
});

await runTest("ti dashboard error keeps technical API messages out of the viewer UI", async () => {
  const tabSource = await readModuleSource("components/TiDashboardTab.tsx");
  const errorState =
    tabSource.match(
      /if \(dashboardQuery\.isError\) \{\s*return \(\s*<DashboardStatePanel[\s\S]*?\/>\s*\);\s*\}/,
    )?.[0] ?? "";

  assert.doesNotMatch(errorState, /dashboardQuery\.error/);
  assert.match(
    errorState,
    /description="Não foi possível carregar seu resumo de chamados\. Tente novamente\."/,
  );
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
  assert.match(source, /useTiInventory\([\s\S]*status: "available"[\s\S]*page_size: 100[\s\S]*enabled: canManage/);
  assert.doesNotMatch(source, /useTiInventory\(undefined, \{ enabled: canManage \}\)/);
  assert.match(source, /departmentService\.list\(\),\s*\{ retry: false, enabled: canManage \}/);
  assert.match(source, /confirm\(/);
});

await runTest("ti inventory list exposes availability status for term asset selectors", async () => {
  const schemaSource = await readWorkspaceSource("services/ti-service/src/schemas/tiInventory.schemas.ts");
  const serviceSource = await readWorkspaceSource("services/ti-service/src/services/tiInventoryService.ts");
  const openApiSource = await readWorkspaceSource("services/ti-service/src/openapi/spec.ts");

  assert.match(schemaSource, /status: z\.enum\(\["available", "assigned"\]\)\.optional\(\)/);
  assert.match(serviceSource, /query\.status === "available"[\s\S]*\{ user_id: null \}/);
  assert.match(serviceSource, /query\.status === "assigned"[\s\S]*\{ user_id: \{ not: null \} \}/);
  assert.match(openApiSource, /enumQueryParameter\("status", "Disponibilidade do ativo", \["available", "assigned"\]\)/);
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

await runTest("ti terms list paginates locally and keeps actions compact", async () => {
  const source = await readModuleSource("components/TiTermsTab.tsx");
  const controlsSource = await readModuleSource("components/tiFormControls.tsx");

  assert.match(source, /import \{ PaginationControls \} from "@shared\/components";/);
  assert.match(source, /const TERMS_PAGE_SIZE = 10;/);
  assert.match(source, /const \[termsPage, setTermsPage\] = useState\(1\);/);
  assert.match(source, /useEffect\(\(\) => \{\s*setTermsPage\(1\);/);
  assert.match(source, /const paginatedTerms = useMemo\(/);
  assert.match(source, /filteredTerms\.slice\(/);
  assert.match(source, /paginatedTerms\.map\(\(term\)/);
  assert.doesNotMatch(source, /filteredTerms\.map\(\(term\)/);
  assert.match(source, /<PaginationControls/);
  assert.match(source, /total=\{filteredTerms\.length\}/);
  assert.match(source, /totalPages=\{termsPageCount\}/);
  assert.match(source, /onPageChange=\{\(page\) => setTermsPage\(page\)\}/);
  assert.match(source, /iconOnly/);
  assert.match(controlsSource, /iconOnly \? "w-8 px-0" : "px-2\.5"/);
});

await runTest("ti terms create uses assignable user selection and edit keeps identity read-only", async () => {
  const source = await readModuleSource("components/TiTermsTab.tsx");

  assert.match(source, /useAssignableUsers/);
  assert.match(source, /name="user_id"/);
  assert.match(source, /label="Usuario"|label="Usu\u00e1rio"/);
  assert.match(source, /isEditingTerm/);
  assert.match(source, /readOnly/);
  assert.doesNotMatch(
    source,
    /name="user_name"[\s\S]*label="Nome do usuario"|name="user_name"[\s\S]*label="Nome do usu\u00e1rio"/,
  );
  assert.doesNotMatch(
    source,
    /name="user_cpf"[\s\S]*label="CPF do usuario"|name="user_cpf"[\s\S]*label="CPF do usu\u00e1rio"/,
  );
});

await runTest("ti terms form sends the backend term contract", async () => {
  const source = await readModuleSource("components/TiTermsTab.tsx");
  const hookSource = await readModuleSource("hooks/useTiTerms.ts");
  const serviceSource = await readModuleSource("services/tiTermsService.ts");
  const typesSource = await readModuleSource("types/terms.ts");
  const termPayloadSource = typesSource.slice(
    typesSource.indexOf("export interface TiTermPayload"),
    typesSource.indexOf("export interface TiTermSignPayload"),
  );
  const signPayloadSource = typesSource.slice(typesSource.indexOf("export interface TiTermSignPayload"));

  for (const expected of [
    "date",
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

  assert.match(source, /const payload: TiTermUpdatePayload = compactPayload/);
  assert.match(source, /createTermMutation\.mutateAsync\(\{\s*\.\.\.payload,\s*user_id: selectedUserId,?\s*\}\)/);
  assert.match(
    typesSource,
    /export type TiTermUpdatePayload = Omit<TiTermPayload, "user_id">/,
  );
  assert.match(serviceSource, /updateTerm\(id: TiId, payload: TiTermUpdatePayload\)/);
  assert.match(hookSource, /payload: TiTermUpdatePayload/);
  assert.match(source, /name="selected_asset_id"/);
  assert.match(source, /name="user_id"/);
  assert.match(source, /name="department_id"/);
  assert.match(source, /departmentService\.list\(\)/);
  assert.match(source, /reason: getFormText\(formData, "reason"\)/);
  assert.match(signPayloadSource, /reason\?: string/);
  assert.doesNotMatch(source, /payload\.user_name/);
  assert.doesNotMatch(source, /payload\.user_cpf/);
  assert.doesNotMatch(source, /user_name: getFormText\(formData, "user_name"\)/);
  assert.doesNotMatch(source, /user_cpf: getFormText\(formData, "user_cpf"\)/);
  assert.doesNotMatch(source, /user_id: getFormText\(formData, "user_id"\)/);
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

  const payloadTypeSource =
    typeSource.match(/export interface TiRobotPayload \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(typeSource, /interface TiRobotPayload/);
  assert.match(typeSource, /interface TiRobotRunPayload/);
  assert.match(payloadTypeSource, /name: string/);
  assert.match(payloadTypeSource, /type: TiRobotType \| string/);
  assert.doesNotMatch(payloadTypeSource, /name\?: string/);
  assert.doesNotMatch(payloadTypeSource, /type\?: TiRobotType \| string/);
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
  assert.match(tabSource, /buildCreateRobotPayload\(robotDraft\)/);
  assert.match(tabSource, /buildUpdateRobotPayload\(robotDraft\)/);
  assert.doesNotMatch(tabSource, /function buildRobotPayload/);
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

await runTest("new TI request discloses required fields before submission", async () => {
  const source = await readModuleSource("components/TiRequestsTab.tsx");

  assert.match(source, /RequiredFieldLabel/);
  assert.match(source, /id="ti-request-title"[\s\S]*aria-required/);
  assert.match(source, /value=\{requestDraft\.category_id\}[\s\S]*aria-required/);
  assert.match(source, /<textarea[\s\S]*aria-required/);
});
