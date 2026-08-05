import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRegularizeClientPfListParams,
  buildRegularizeMunicipalTaxesListParams,
  buildRegularizeProcessListParams,
  buildRegularizeSitePasswordListParams,
  unwrapRegularizePage,
} from "./services/regularizeService.contract.ts";

const moduleRoot = fileURLToPath(new URL("./", import.meta.url));
const appRoot = join(moduleRoot, "../../..");
const moduleRootRelative = "src/modules/regularize";

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

await runTest("regularize endpoints stay centralized in the frontend contract", async () => {
  const contractSource = await readModuleSource("services/regularizeService.contract.ts");

  for (const endpoint of [
    "/regularize/passwords",
    "/regularize/password",
    "/regularize/sites-pass",
    "/regularize/sites-pass-detail",
    "/regularize/pf",
    "/regularize/pfs",
    "/regularize/partners",
    "/regularize/partner",
    "/regularize/municipal-taxes",
    "/regularize/municipal-taxes-detail",
    "/regularize/processes",
    "/regularize/process",
    "/regularize/guidance/list",
    "/regularize/guidance/detail",
    "/regularize/guidance",
    "/regularize/guidance/activity/add",
    "/regularize/guidance/activity/remove",
    "/regularize/guidance/partner/add",
    "/regularize/guidance/partner/remove",
    "/regularize/licenses",
    "/regularize/license",
  ]) {
    assert.match(contractSource, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
});

await runTest("regularize licenses list all statuses by default and keep mutation invalidation", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const operationsSource = await readModuleSource("hooks/useRegularizeOperations.ts");

  assert.match(
    pageSource,
    /const licenseQuery = useRegularizeLicenses\(\s*\{ status: "Todos" \},\s*\{ enabled: queryPolicy\.licenses \},\s*\);/,
  );
  assert.match(
    operationsSource,
    /export function useCreateRegularizeLicenseMutation[\s\S]*?onSuccess: \(\) => invalidateRegularizeOperations\(queryClient\)/,
  );
  assert.match(
    operationsSource,
    /export function useUpdateRegularizeLicenseMutation[\s\S]*?onSuccess: \(\) => invalidateRegularizeOperations\(queryClient\)/,
  );
});

await runTest("regularize license responsible field uses the contextual selector", async () => {
  const source = await readModuleSource("components/RegularizeLicenseForm.tsx");

  assert.match(source, /useAssignableUsers/);
  assert.match(source, /module: "regularize"/);
  assert.match(source, /<RegularizeNativeSelect[\s\S]*value=\{formState\.responsible_id\}/);
  assert.match(source, /Respons.vel atual/);
  assert.doesNotMatch(source, /Respons.vel ID/);
});

await runTest("regularize PF list contract preserves explicit search status and pagination", async () => {
  assert.deepEqual(
    buildRegularizeClientPfListParams({
      status: "Ativo",
      search: "ana",
      page: 2,
      limit: 20,
    }),
    { status: "Ativo", search: "ana", page: 2, limit: 20 },
  );

  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const peopleSource = await readModuleSource("hooks/useRegularizePeople.ts");
  const queryKeysSource = await readModuleSource("hooks/queryKeys.ts");

  assert.match(pageSource, /const \[pfSearch, setPfSearch\] = useState\(""\)/);
  assert.match(pageSource, /const \[pfStatus, setPfStatus\] = useState\("Todos"\)/);
  assert.match(pageSource, /usePaginatedRegularizeClientPfs/);
  assert.match(pageSource, /placeholder="Buscar por nome, código ou CPF"/);
  assert.match(pageSource, /label="Status"/);
  assert.match(pageSource, /<PaginationControls/);
  assert.match(peopleSource, /usePaginatedRegularizeClientPfs/);
  assert.match(queryKeysSource, /clientPfsPage/);
});

await runTest("regularize PF forms search every paginated PF option and preserve linked clients", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.doesNotMatch(pageSource, /limit: 100/);

  const [partnerFormSource, processFormSource] = await Promise.all([
    readModuleSource("components/RegularizePartnerForm.tsx"),
    readModuleSource("components/RegularizeProcessForm.tsx"),
  ]);
  assert.match(partnerFormSource, /RegularizeClientPfSelect/);
  assert.match(processFormSource, /RegularizeClientPfSelect/);
  assert.match(partnerFormSource, /<fieldset/);
  assert.match(partnerFormSource, /<legend[^>]*>[\s\S]*<span>Cliente PF<\/span>/);
  assert.match(processFormSource, /<fieldset/);
  assert.doesNotMatch(partnerFormSource, /<RegularizeFormField label="Cliente PF"/);
  assert.match(partnerFormSource, /onChange=\{\(id\) => handleChange\("pf_id", id\)\}/);
  assert.match(processFormSource, /handleClientPfChange\(id, option\?\.cpf\)/);

  const selectSource = await readModuleSource("components/RegularizeClientPfSelect.tsx");
  assert.match(selectSource, /usePaginatedRegularizeClientPfs/);
  assert.match(selectSource, /useRegularizeClientPfDetail/);
  assert.match(selectSource, /placeholder="Buscar PF por nome, código ou CPF"/);
  assert.match(selectSource, /page: pfPage/);
  assert.match(selectSource, /onNext/);
  assert.match(selectSource, /selectedPfQuery\.data/);
  assert.match(selectSource, /aria-label="Buscar cliente PF"/);
  assert.match(selectSource, /aria-label="Selecionar cliente PF"/);
  assert.match(selectSource, /role="status"/);
  assert.match(selectSource, /role="alert"/);
  assert.match(selectSource, /Tentar novamente/);
  assert.match(selectSource, /const error = listQuery\.error \?\? selectedPfQuery\.error/);
  assert.match(selectSource, /listQuery\.refetch/);
});

await runTest("regularize document inputs keep masks while payloads use canonical digits", async () => {
  const [
    processFormSource,
    guidancePartnerFormSource,
    guidanceFormSource,
    clientPfFormSource,
  ] = await Promise.all([
    readModuleSource("components/RegularizeProcessForm.tsx"),
    readModuleSource("components/RegularizeGuidancePartnerForm.tsx"),
    readModuleSource("components/RegularizeGuidanceForm.tsx"),
    readModuleSource("components/RegularizeClientPfForm.tsx"),
  ]);

  assert.match(processFormSource, /formatCpfCnpjInput/);
  assert.match(processFormSource, /normalizeDigits/);
  assert.match(
    processFormSource,
    /handleChange\("cpf_cnpj", formatCpfCnpjInput\(event\.target\.value\)\)/,
  );
  assert.match(
    processFormSource,
    /cpf_cnpj: normalizeDigits\(trimRegularizeText\(formState\.cpf_cnpj\)\)/,
  );

  assert.match(guidancePartnerFormSource, /formatCpfInput/);
  assert.match(guidancePartnerFormSource, /normalizeDigits/);
  assert.match(
    guidancePartnerFormSource,
    /handleChange\("cpf", formatCpfInput\(event\.target\.value\)\)/,
  );
  assert.match(
    guidancePartnerFormSource,
    /cpf: normalizeDigits\(trimRegularizeText\(formState\.cpf\)\)/,
  );

  assert.match(guidanceFormSource, /formatCpfCnpjInput/);
  assert.match(guidanceFormSource, /normalizeDigits/);
  assert.match(
    guidanceFormSource,
    /handleChange\("cpf_cnpj", formatCpfCnpjInput\(event\.target\.value\)\)/,
  );
  assert.match(
    guidanceFormSource,
    /cpf_cnpj: normalizeDigits\(trimRegularizeOptionalText\(formState\.cpf_cnpj\)\)/,
  );

  assert.match(clientPfFormSource, /formatCpfInput/);
  assert.match(clientPfFormSource, /normalizeDigits/);
  assert.match(
    clientPfFormSource,
    /handleChange\("cpf", formatCpfInput\(event\.target\.value\)\)/,
  );
  assert.match(
    clientPfFormSource,
    /cpf: normalizeDigits\(trimRegularizeText\(formState\.cpf\)\)/,
  );
});

await runTest("regularize dashboard has a centralized aggregate data contract", async () => {
  const contractSource = await readModuleSource("services/regularizeService.contract.ts");
  const serviceSource = await readModuleSource("services/regularizeService.ts");
  const hookSource = await readModuleSource("hooks/useRegularizeDashboard.ts");
  const queryKeysSource = await readModuleSource("hooks/queryKeys.ts");

  assert.match(contractSource, /dashboard: "\/regularize\/dashboard"/);
  assert.match(contractSource, /buildRegularizeDashboardParams/);
  assert.match(serviceSource, /async getDashboard\(year: number\)/);
  assert.match(serviceSource, /REGULARIZE_ENDPOINTS\.dashboard/);
  assert.match(hookSource, /useRegularizeDashboard/);
  assert.match(hookSource, /regularizeQueryKeys\.dashboard\(year\)/);
  assert.match(queryKeysSource, /dashboardRoot/);
  assert.match(queryKeysSource, /dashboard: \(year: number\)/);
});

await runTest("regularize mutations invalidate aggregate dashboard data", async () => {
  for (const hookPath of [
    "hooks/useRegularizeCredentials.ts",
    "hooks/useRegularizePeople.ts",
    "hooks/useRegularizeOperations.ts",
  ]) {
    const source = await readModuleSource(hookPath);
    assert.match(source, /regularizeQueryKeys\.dashboardRoot\(\)/);
  }
});

await runTest("regularize dashboard enables only its aggregate query", async () => {
  const { getRegularizeQueryPolicy } = await import("./utils/regularizeQueryPolicy.ts");

  assert.deepEqual(getRegularizeQueryPolicy("dashboard"), {
    dashboard: true,
    clientPfs: false,
    sitePasswords: false,
    municipalTaxes: false,
    processes: false,
    licenses: false,
    partners: false,
    passwords: false,
    guidance: false,
  });
});

await runTest("regularize tab query policy enables only owning contexts", async () => {
  const { getRegularizeQueryPolicy } = await import("./utils/regularizeQueryPolicy.ts");

  assert.deepEqual(getRegularizeQueryPolicy("passwords"), {
    dashboard: false,
    clientPfs: false,
    sitePasswords: true,
    municipalTaxes: false,
    processes: false,
    licenses: false,
    partners: false,
    passwords: true,
    guidance: false,
  });
  assert.equal(getRegularizeQueryPolicy("processes").clientPfs, true);
  assert.equal(getRegularizeQueryPolicy("processes").guidance, true);
  assert.equal(getRegularizeQueryPolicy("partners").partners, true);
  assert.equal(getRegularizeQueryPolicy("taxes").municipalTaxes, true);
});

await runTest("regularize safely extracts requestId for contextual errors", async () => {
  const { getRegularizeRequestId } = await import("./utils/regularizeApiError.ts");

  assert.equal(
    getRegularizeRequestId({ response: { data: { requestId: "request-dashboard-1" } } }),
    "request-dashboard-1",
  );
  assert.equal(getRegularizeRequestId(new Error("network")), undefined);
  assert.equal(getRegularizeRequestId({ response: { data: { requestId: 10 } } }), undefined);
});

await runTest("simultaneous server errors produce one active toast", async () => {
  const { SERVER_ERROR_TOAST_ID, notifyServerError } = await import(
    "../../shared/services/serverErrorToast.ts"
  );
  let active = false;
  const calls = [];
  const adapter = {
    isActive(id) {
      assert.equal(id, SERVER_ERROR_TOAST_ID);
      return active;
    },
    error(message, options) {
      calls.push({ message, options });
      active = true;
    },
  };

  notifyServerError(adapter);
  notifyServerError(adapter);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.toastId, SERVER_ERROR_TOAST_ID);

  active = false;
  notifyServerError(adapter);
  assert.equal(calls.length, 2);
});

await runTest("API client delegates 5xx feedback to the deduplicated notifier", async () => {
  const apiSource = await readFile(join(appRoot, "src/shared/services/api.ts"), "utf8");

  assert.match(apiSource, /notifyServerError\(toast\)/);
  assert.doesNotMatch(apiSource, /toast\.error\(SERVER_ERROR_TOAST_MESSAGE\)/);
});

await runTest("regularize page renders aggregate dashboard and lazy list options", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(
    pageSource,
    /useRegularizeDashboard\(currentYear, \{\s*enabled: queryPolicy\.dashboard,\s*\}\)/,
  );
  assert.match(pageSource, /getRegularizeQueryPolicy\(activeTab\)/);
  assert.match(pageSource, /enabled: queryPolicy\.clientPfs/);
  assert.match(pageSource, /enabled: queryPolicy\.sitePasswords/);
  assert.match(pageSource, /enabled: queryPolicy\.municipalTaxes/);
  assert.match(pageSource, /enabled: queryPolicy\.processes/);
  assert.match(pageSource, /enabled: queryPolicy\.licenses/);
  assert.match(pageSource, /dashboardQuery\.data\.metrics/);
  assert.match(pageSource, /getRegularizeRequestId\(dashboardQuery\.error\)/);
  assert.doesNotMatch(pageSource, /const metricData = useMemo/);
});

await runTest("regularize list params carry server search and pagination", async () => {
  assert.deepEqual(
    buildRegularizeProcessListParams({
      status: "Aberto",
      search: " Acme ",
      page: 2,
      limit: 20,
    }),
    { status: "Aberto", search: "Acme", page: 2, limit: 20 },
  );
  assert.deepEqual(
    buildRegularizeSitePasswordListParams({
      status: true,
      search: " Gov ",
      page: 2,
      limit: 20,
    }),
    { status: true, search: "Gov", page: 2, limit: 20 },
  );
  const page = { data: [{ id: "row-21" }], total: 21, page: 2, limit: 20, hasMore: false };
  assert.deepEqual(unwrapRegularizePage({ data: page }, { page: 2, limit: 20 }), page);
});

await runTest("regularize municipal tax contract carries filters and unwraps a page", async () => {
  for (const type of ["TFF", "TLP", "TLL"]) {
    assert.deepEqual(
      buildRegularizeMunicipalTaxesListParams({
        year: 2026,
        search: " Castelo ",
        status: "Criado",
        type,
        page: 2,
        limit: 20,
      }),
      { year: 2026, search: "Castelo", status: "Criado", type, page: 2, limit: 20 },
    );
  }

  const [queryKeysSource, serviceSource, hookSource] = await Promise.all([
    readModuleSource("hooks/queryKeys.ts"),
    readModuleSource("services/regularizeService.ts"),
    readModuleSource("hooks/useRegularizeOperations.ts"),
  ]);

  assert.match(
    queryKeysSource,
    /"municipal-taxes",\s*filters\.year,\s*filters\.search \?\? "",\s*filters\.status \?\? "Todos",\s*filters\.type \?\? "Todos",\s*filters\.page \?\? 1,\s*filters\.limit \?\? 20/,
  );
  assert.match(serviceSource, /Promise<RegularizeMunicipalTaxesPage>/);
  assert.match(serviceSource, /unwrapRegularizeEnvelope<RegularizeMunicipalTaxesPage>\(response\.data\)/);
  assert.match(hookSource, /UseQueryResult<RegularizeMunicipalTaxesPage, Error>/);
});

await runTest("regularize municipal tax tab uses debounced filters and paginated rows", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /const \[taxSearch, setTaxSearch\] = useState\(""\)/);
  assert.match(
    pageSource,
    /const \[taxStatus, setTaxStatus\] = useState(?:<"Todos" \| "Criado" \| "Pendente">)?\("Todos"\)/,
  );
  assert.match(pageSource, /const \[taxYear, setTaxYear\] = useState\(\(\) => new Date\(\)\.getFullYear\(\)\)/);
  assert.match(pageSource, /const \[taxType, setTaxType\] = useState<"Todos" \| "TFF" \| "TLP" \| "TLL">\("Todos"\)/);
  assert.match(pageSource, /useDebouncedValue\(taxSearch\.trim\(\), 300\)/);
  assert.match(pageSource, /setTaxPage\(1\)/);
  assert.match(pageSource, /year: taxYear/);
  assert.match(pageSource, /search: debouncedTaxSearch/);
  assert.match(pageSource, /status: taxStatus/);
  assert.match(pageSource, /type: taxType/);
  assert.match(pageSource, /limit: REGULARIZE_PAGE_SIZE/);
  assert.match(pageSource, /data: isTaxSearchPending \? undefined : taxQuery\.data\?\.data/);
  assert.match(pageSource, /total=\{taxQuery\.data\?\.total \?\? 0\}/);
  assert.match(pageSource, /hasMore=\{taxQuery\.data\?\.hasMore \?\? false\}/);
  assert.match(pageSource, /<span className="text-sm font-medium text-gray-700 dark:text-gray-200">Tipo<\/span>/);
  assert.match(pageSource, /value=\{taxType\}[\s\S]{0,180}setTaxType\(event\.target\.value as "Todos" \| "TFF" \| "TLP" \| "TLL"\);[\s\S]{0,80}setTaxPage\(1\)/);
  for (const type of ["Todos", "TFF", "TLP", "TLL"]) {
    assert.match(pageSource, new RegExp(`\\["Todos", "TFF", "TLP", "TLL"\\]|<option[^>]*>${type}<\\/option>`));
  }
});

await runTest("regularize management tables use debounced paginated hooks", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /usePaginatedRegularizeProcesses/);
  assert.match(pageSource, /usePaginatedRegularizeSitePasswords/);
  assert.match(pageSource, /useDebouncedValue\(processSearch\.trim\(\), 300\)/);
  assert.match(pageSource, /useDebouncedValue\(siteSearch\.trim\(\), 300\)/);
  assert.match(pageSource, /<PaginationControls/);
  assert.doesNotMatch(pageSource, /selectedCredentialClientId[\s\S]{0,120}sitePageQuery/);
});

await runTest("regularize process selection follows the visible page and gives explicit feedback", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(
    pageSource,
    /const visibleProcessRows = isProcessSearchPending \? \[\] : processPageQuery\.data\?\.data \?\? \[\];/,
  );
  assert.match(pageSource, /const automaticProcessId = visibleProcessRows\[0\]\?\.id;/);
  assert.match(pageSource, /const currentProcessId = selectedProcessId \?\? automaticProcessId;/);
  assert.match(pageSource, /type ProcessSelectionOrigin = "automatic" \| "manual";/);
  assert.match(
    pageSource,
    /const \[processSelectionOrigin, setProcessSelectionOrigin\] = useState<ProcessSelectionOrigin>\(\s*"automatic",?\s*\);/,
  );
  assert.match(pageSource, /function resetProcessSelection\(\)/);
  assert.match(pageSource, /function selectProcessManually\(processId: RegularizeId\)/);
  assert.match(pageSource, /aria-selected=\{currentProcessId === item\.id\}/);
  assert.match(pageSource, /bg-blue-50 dark:bg-blue-950\/30/);
  assert.match(pageSource, /role="status"\s+aria-live="polite"/);
  assert.match(pageSource, /processSelectionOrigin === "manual"/);
});

await runTest("regularize process eye opens a centered detail dialog", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /import \{ Dialog \} from "@shared\/components\/ui\/Dialog";/);
  assert.match(pageSource, /const \[isProcessDetailDialogOpen, setIsProcessDetailDialogOpen\] = useState\(false\);/);
  assert.match(pageSource, /function openProcessDetail\(processId: RegularizeId\)/);
  assert.match(pageSource, /setIsProcessDetailDialogOpen\(true\)/);
  assert.match(pageSource, /title="Ver detalhe"[\s\S]{0,180}openProcessDetail\(item\.id\)/);
  assert.match(pageSource, /<Dialog[\s\S]{0,220}open=\{isProcessDetailDialogOpen\}/);
  assert.match(pageSource, /title="Detalhes do processo"/);
  assert.match(pageSource, /onOpenChange=\{setIsProcessDetailDialogOpen\}/);
  assert.match(pageSource, /label="Tipo"/);
  assert.match(pageSource, /label="Urgência"/);
});

await runTest("regularize manually selected process detail is safely focused on narrow viewports", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /const selectedProcessDetailRef = useRef<HTMLElement \| null>\(null\);/);
  assert.match(pageSource, /typeof window === "undefined"/);
  assert.match(pageSource, /window\.matchMedia\("\(min-width: 1280px\)"\)\.matches/);
  assert.match(pageSource, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(pageSource, /selectedProcessDetailRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(pageSource, /selectedProcessDetailRef\.current\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\);/);
  assert.match(pageSource, /panelRef=\{selectedProcessDetailRef\}/);
});

await runTest("regularize service is the only module file importing the API client", async () => {
  const files = await collectSourceFiles(moduleRoot);
  const offenders = [];

  for (const file of files) {
    const relativePath = relative(appRoot, file).replaceAll("\\", "/");

    if (relativePath === `${moduleRootRelative}/services/regularizeService.ts`) {
      continue;
    }

    const source = await readFile(file, "utf8");

    if (source.includes("@shared/services/apiClient") || source.includes("@shared/services/api")) {
      offenders.push(relativePath);
    }
  }

  assert.deepEqual(offenders, []);
});

await runTest("regularize hooks use the domain query keys", async () => {
  for (const hookPath of [
    "hooks/useRegularizeCredentials.ts",
    "hooks/useRegularizePeople.ts",
    "hooks/useRegularizeOperations.ts",
  ]) {
    const source = await readModuleSource(hookPath);

    assert.match(source, /regularizeQueryKeys/);
    assert.match(source, /useFetch/);
  }
});

await runTest("regularize core service exposes create and update endpoints", async () => {
  const serviceSource = await readModuleSource("services/regularizeService.ts");

  for (const endpoint of ["passwords", "sitesPass", "pf", "partners"]) {
    assert.match(
      serviceSource,
      new RegExp(`api\\.post\\(REGULARIZE_ENDPOINTS\\.${endpoint}`),
    );
    assert.match(
      serviceSource,
      new RegExp(`api\\.put\\(REGULARIZE_ENDPOINTS\\.${endpoint}`),
    );
  }
});

await runTest("regularize operations service exposes create and update endpoints", async () => {
  const serviceSource = await readModuleSource("services/regularizeService.ts");

  for (const endpoint of ["municipalTaxes", "process", "guidance", "license"]) {
    assert.match(
      serviceSource,
      new RegExp(`api\\.post\\(REGULARIZE_ENDPOINTS\\.${endpoint}`),
    );
    assert.match(
      serviceSource,
      new RegExp(`api\\.put\\(REGULARIZE_ENDPOINTS\\.${endpoint}`),
    );
  }

  for (const endpoint of [
    "guidanceActivityAdd",
    "guidanceActivityRemove",
    "guidancePartnerAdd",
    "guidancePartnerRemove",
  ]) {
    assert.match(
      serviceSource,
      new RegExp(`api\\.post\\(REGULARIZE_ENDPOINTS\\.${endpoint}`),
    );
  }
});

await runTest("regularize core mutations stay in hooks and invalidate cache", async () => {
  for (const hookPath of [
    "hooks/useRegularizeCredentials.ts",
    "hooks/useRegularizePeople.ts",
  ]) {
    const source = await readModuleSource(hookPath);

    assert.match(source, /useMutation/);
    assert.match(source, /useQueryClient/);
    assert.match(source, /invalidateQueries\(\{\s*queryKey: regularizeQueryKeys/);
  }
});

await runTest("regularize operations mutations stay in hooks and invalidate cache", async () => {
  const source = await readModuleSource("hooks/useRegularizeOperations.ts");

  for (const mutationName of [
    "useCreateRegularizeMunicipalTaxMutation",
    "useUpdateRegularizeMunicipalTaxMutation",
    "useCreateRegularizeProcessMutation",
    "useUpdateRegularizeProcessMutation",
    "useCreateRegularizeGuidanceMutation",
    "useUpdateRegularizeGuidanceMutation",
    "useAddRegularizeGuidanceActivityMutation",
    "useRemoveRegularizeGuidanceActivityMutation",
    "useAddRegularizeGuidancePartnerMutation",
    "useRemoveRegularizeGuidancePartnerMutation",
    "useCreateRegularizeLicenseMutation",
    "useUpdateRegularizeLicenseMutation",
  ]) {
    assert.match(source, new RegExp(`export function ${mutationName}`));
  }

  assert.match(source, /useMutation/);
  assert.match(source, /useQueryClient/);
  assert.match(source, /invalidateQueries\(\{\s*queryKey: regularizeQueryKeys/);
});

await runTest("regularize components do not own API calls or mutations", async () => {
  const files = await collectSourceFiles(join(moduleRoot, "components"));
  const offenders = [];

  for (const file of files) {
    const relativePath = relative(appRoot, file).replaceAll("\\", "/");
    const source = await readFile(file, "utf8");

    if (
      source.includes("api.") ||
      source.includes("setupAPIClient") ||
      source.includes("useMutation(")
    ) {
      offenders.push(relativePath);
    }
  }

  assert.deepEqual(offenders, []);
});

await runTest("regularize operations forms are wired in the page", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  for (const formName of [
    "RegularizeMunicipalTaxesForm",
    "RegularizeProcessForm",
    "RegularizeGuidanceForm",
    "RegularizeGuidanceActivityForm",
    "RegularizeGuidancePartnerForm",
    "RegularizeLicenseForm",
  ]) {
    assert.match(pageSource, new RegExp(`<${formName}`));
  }
});

await runTest("regularize operational tabs expose write actions", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  for (const label of [
    "Novo processo",
    "Nova licença",
    "Novo tributo",
    "Nova orientação",
    "Adicionar atividade",
    "Adicionar sócio",
  ]) {
    assert.match(pageSource, new RegExp(`label="${label}"`));
  }
});

await runTest("regularize partners render client names instead of internal ids", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /const pfNameById = new Map\(\s*\(pfPageQuery\.data\?\.data \?\? \[\]\)/);
  assert.match(pageSource, /const pjNameById = new Map\(\s*\(clientQuery\.data\?\.items \?\? \[\]\)/);
  assert.match(pageSource, /pfNameById\.get\(item\.pf_id\)\s*(?:\?\?|\|\|)\s*"PF não identificado"/);
  assert.match(pageSource, /pjNameById\.get\(item\.pj_id\)\s*(?:\?\?|\|\|)\s*"PJ não identificado"/);
  assert.doesNotMatch(pageSource, /formatText\(item\.pf_id\)\.slice\(0, 8\)/);
  assert.doesNotMatch(pageSource, /formatText\(item\.pj_id\)\.slice\(0, 8\)/);
});

await runTest("regularize municipal tax keeps row actions visible and centered", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const taxTableStart = pageSource.indexOf(
    'DataTable headers={["Cliente", "Documento", "Cidade", "Ano", "Registro"',
  );
  const taxTableEnd = pageSource.indexOf("</DataTable>", taxTableStart);
  const taxTableSource = pageSource.slice(taxTableStart, taxTableEnd);

  assert.match(pageSource, /headers\.map\(\(header\) =>/);
  assert.match(pageSource, /header === "" \|\| header === "Ação"/);
  assert.match(
    pageSource,
    /DataTable headers=\{\["Cliente", "Documento", "Cidade", "Ano", "Registro", "Ação"\]\}/,
  );
  assert.match(pageSource, /label="Novo tributo"/);
  assert.match(taxTableSource, /TableTextActionButton/);
  assert.match(taxTableSource, /title="Editar tributo"/);
  assert.match(taxTableSource, /label="Editar"/);
  assert.match(taxTableSource, /mode: "edit"/);
  assert.match(taxTableSource, /mode: "create"/);
  assert.match(taxTableSource, /<td className="px-4 py-3 text-center">/);
  assert.match(taxTableSource, /<div className="flex justify-center">/);
  assert.doesNotMatch(taxTableSource, /<span className="text-sm text-gray-400 dark:text-slate-500">-<\/span>/);
  assert.doesNotMatch(taxTableSource, /Cadastrar/);
  assert.doesNotMatch(taxTableSource, /Criar tributo/);
});

await runTest("regularize core forms are wired in the page", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  for (const formName of [
    "RegularizeClientPfForm",
    "RegularizePartnerForm",
    "RegularizePasswordForm",
    "RegularizeSitePasswordForm",
  ]) {
    assert.match(pageSource, new RegExp(`<${formName}`));
  }
});

await runTest("regularize password creation requires a selected client", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const passwordLabelIndex = pageSource.indexOf('label="Nova senha"');
  const passwordActionStart = pageSource.lastIndexOf("<PrimaryActionButton", passwordLabelIndex);
  const passwordActionEnd = pageSource.indexOf("/>", passwordLabelIndex);
  const passwordActionSource = pageSource.slice(passwordActionStart, passwordActionEnd);

  assert.notEqual(passwordLabelIndex, -1);
  assert.notEqual(passwordActionStart, -1);
  assert.notEqual(passwordActionEnd, -1);
  assert.match(passwordActionSource, /disabled=\{!currentCredentialClientId\}/);
});

await runTest("regularize process empty state is centered across the process view", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /emptyClassName="[^"]*xl:col-span-2[^"]*"/);
  assert.match(pageSource, /emptyClassName="[^"]*items-center[^"]*justify-center[^"]*"/);
});

await runTest("regularize client documents are consistently formatted", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const pfSelectSource = await readModuleSource("components/RegularizeClientPfSelect.tsx");
  const rawDocumentMatches = pageSource.match(/formatText\(item\.cpf_cnpj\)/g) ?? [];
  const formattedDocumentMatches = pageSource.match(/formatDocument\(item\.cpf_cnpj\)/g) ?? [];

  assert.match(pageSource, /import \{ formatCPF_CNPJ \} from "@shared\/utils\/formatters";/);
  assert.match(pageSource, /function formatDocument/);
  assert.deepEqual(rawDocumentMatches, []);
  assert.ok(formattedDocumentMatches.length >= 3);
  assert.doesNotMatch(pageSource, /description: client\.cpf_cnpj/);
  assert.match(pfSelectSource, /import \{ formatCPF_CNPJ \} from "@shared\/utils\/formatters";/);
  assert.match(pfSelectSource, /cpf: clientPf\.cpf/);
  assert.match(pfSelectSource, /formatCPF_CNPJ\(option\.cpf\)/);
  assert.match(
    pageSource,
    /return item\.clientPJ\?\.name \?\? item\.clientPF\?\.name \?\? formatDocument\(item\.cpf_cnpj\);/,
  );
  assert.doesNotMatch(pageSource, /formatText\(partner\.cpf \?\? partner\.document\)/);
  assert.doesNotMatch(pageSource, /formatText\(item\.cpf\)/);
  assert.doesNotMatch(pageSource, /formatText\(clientPfDetailQuery\.data\.cpf\)/);
  assert.match(pageSource, /formatDocument\(partner\.cpf \?\? partner\.document\)/);
  assert.match(pageSource, /formatDocument\(item\.cpf\)/);
  assert.match(pageSource, /formatDocument\(clientPfDetailQuery\.data\.cpf\)/);
});

await runTest("regularize required field errors render as sticky alerts", async () => {
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");

  assert.match(controlsSource, /role="alert"/);
  assert.match(controlsSource, /sticky top-0/);
});

await runTest("regularize required field markers keep label punctuation spacing clean", async () => {
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");

  assert.match(controlsSource, /inline-flex items-center gap-1/);
  assert.match(controlsSource, /<span>\{label\}<\/span>/);
  assert.match(controlsSource, /<span className="text-red-500">\*<\/span>/);
  assert.doesNotMatch(controlsSource, /> \*<\/span>/);
});

await runTest("regularize form action footers stay unseparated", async () => {
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");
  const actionsStart = controlsSource.indexOf("export function RegularizeFormActions");
  const actionsSource = controlsSource.slice(actionsStart);

  assert.match(actionsSource, /className="flex justify-end gap-2 pt-2"/);
  assert.doesNotMatch(actionsSource, /border-t/);
  assert.doesNotMatch(actionsSource, /dark:border/);
});

await runTest("regularize selects use the shared native select arrow", async () => {
  const files = await collectSourceFiles(join(moduleRoot, "components"));
  const rawSelectOffenders = [];

  for (const file of files) {
    const relativePath = relative(appRoot, file).replaceAll("\\", "/");

    if (relativePath === `${moduleRootRelative}/components/RegularizeNativeSelect.tsx`) {
      continue;
    }

    const source = await readFile(file, "utf8");

    if (source.includes("<select")) {
      rawSelectOffenders.push(relativePath);
    }
  }

  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");
  const nativeSelectSource = await readModuleSource("components/RegularizeNativeSelect.tsx");

  assert.deepEqual(rawSelectOffenders, []);
  assert.match(controlsSource, /appearance-none/);
  assert.match(controlsSource, /bg-\[position:right_0\.95rem_center\]/);
  assert.match(nativeSelectSource, /regularizeSelectArrowStyle/);
  assert.match(nativeSelectSource, /backgroundImage/);
});

await runTest("regularize finite status and urgency fields use native selects", async () => {
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");
  const clientPfSource = await readModuleSource("components/RegularizeClientPfForm.tsx");
  const processSource = await readModuleSource("components/RegularizeProcessForm.tsx");
  const guidanceSource = await readModuleSource("components/RegularizeGuidanceForm.tsx");
  const licenseSource = await readModuleSource("components/RegularizeLicenseForm.tsx");

  for (const optionExport of [
    "regularizeClientStatusOptions",
    "regularizeProcessStatusOptions",
    "regularizeGuidanceStatusOptions",
    "regularizeLicenseStatusOptions",
    "regularizeUrgencyOptions",
    "getRegularizePresetOptions",
  ]) {
    assert.match(controlsSource, new RegExp(`export .*${optionExport}`));
  }

  assert.match(clientPfSource, /regularizeClientStatusOptions/);
  assert.match(clientPfSource, /<RegularizeNativeSelect\s+value=\{formState\.status\}/);
  assert.match(processSource, /regularizeProcessStatusOptions/);
  assert.match(processSource, /regularizeUrgencyOptions/);
  assert.match(processSource, /<RegularizeNativeSelect\s+value=\{formState\.status\}/);
  assert.match(processSource, /<RegularizeNativeSelect\s+value=\{formState\.urgency\}/);
  assert.match(guidanceSource, /regularizeGuidanceStatusOptions/);
  assert.match(guidanceSource, /<RegularizeNativeSelect\s+value=\{formState\.status\}/);
  assert.match(licenseSource, /regularizeLicenseStatusOptions/);
  assert.match(licenseSource, /regularizeUrgencyOptions/);
  assert.match(licenseSource, /<RegularizeNativeSelect\s+value=\{formState\.status\}/);
  assert.match(licenseSource, /<RegularizeNativeSelect\s+value=\{formState\.urgency\}/);
});

await runTest("regularize process task id uses the real task selector", async () => {
  const processSource = await readModuleSource("components/RegularizeProcessForm.tsx");
  const tasksHookSource = await readFile(
    join(appRoot, "src/modules/integracao/hooks/useIntegracaoTasks.ts"),
    "utf8",
  );

  assert.match(tasksHookSource, /options\??: \{\s*enabled\??: boolean/);
  assert.match(tasksHookSource, /enabled: options\.enabled \?\? true/);
  assert.match(processSource, /useIntegracaoTasksList/);
  assert.match(processSource, /status: "Todos",\s*limit: 100,\s*search: taskSearch/);
  assert.match(processSource, /\{\s*enabled: open\s*\}/);
  assert.match(processSource, /value=\{taskSearch\}/);
  assert.match(processSource, /taskSearch/);
  assert.match(processSource, /<RegularizeNativeSelect\s+value=\{formState\.task_id\}/);
  assert.match(processSource, /taskOptions\.map/);
  assert.match(processSource, /tasksQuery\.isLoading/);
  assert.match(processSource, /tasksQuery\.error/);
  assert.match(processSource, /disabled=/);
  assert.match(processSource, /Sem task vinculada/);
  assert.doesNotMatch(processSource, /<input\s+value=\{formState\.task_id\}/);
});

await runTest("regularize municipal tax year uses the shared native select", async () => {
  const municipalTaxSource = await readModuleSource("components/RegularizeMunicipalTaxesForm.tsx");
  const yearFieldStart = municipalTaxSource.indexOf('<RegularizeFormField label="Ano" required>');
  const yearFieldEnd = municipalTaxSource.indexOf("</RegularizeFormField>", yearFieldStart);
  const yearFieldSource = municipalTaxSource.slice(yearFieldStart, yearFieldEnd);

  assert.match(municipalTaxSource, /function getRegularizeMunicipalTaxYearOptions/);
  assert.match(yearFieldSource, /<RegularizeNativeSelect\s+value=\{formState\.year\}/);
  assert.match(yearFieldSource, /handleChange\("year", event\.target\.value\)/);
  assert.match(yearFieldSource, /yearOptions\.map/);
  assert.doesNotMatch(yearFieldSource, /type="number"/);
  assert.doesNotMatch(yearFieldSource, /regularizeTextFieldClassName/);
});

await runTest("regularize tab actions align with the lower edge of tab headers", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /sm:items-end/);
  assert.doesNotMatch(pageSource, /sm:items-start sm:justify-between/);
});

await runTest("regularize primary CRUD action buttons center icon and label", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");
  const actionButtonStart = pageSource.indexOf("function PrimaryActionButton");
  const actionButtonEnd = pageSource.indexOf("function TabActionHeader", actionButtonStart);
  const actionButtonSource = pageSource.slice(actionButtonStart, actionButtonEnd);

  assert.match(controlsSource, /inline-flex items-center justify-center gap-2/);
  assert.match(controlsSource, /px-4 py-2 text-sm font-medium/);
  assert.doesNotMatch(controlsSource, /leading-none/);
  assert.match(actionButtonSource, /<Icon className="h-4 w-4 shrink-0" \/>/);
  assert.match(actionButtonSource, /<span>\{label\}<\/span>/);
  assert.doesNotMatch(actionButtonSource, /<span className="inline-flex items-center gap-2">/);
});

await runTest("regularize credential detail panels stretch with their grids", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const detailPanelStart = pageSource.indexOf("function DetailPanel");
  const detailPanelEnd = pageSource.indexOf("function FieldLine", detailPanelStart);
  const detailPanelSource = pageSource.slice(detailPanelStart, detailPanelEnd);
  const credentialGridMatches = pageSource.match(
    /grid gap-4 xl:grid-cols-\[minmax\(0,1\.4fr\)_minmax\(320px,0\.8fr\)\] xl:items-stretch/g,
  );

  assert.match(detailPanelSource, /className="[^"]*h-full[^"]*flex-col[^"]*"/);
  assert.match(detailPanelSource, /bg-white/);
  assert.match(detailPanelSource, /dark:bg-slate-900/);
  assert.doesNotMatch(detailPanelSource, /bg-gray-50/);
  assert.doesNotMatch(detailPanelSource, /dark:bg-slate-950/);
  assert.ok((credentialGridMatches?.length ?? 0) >= 2);
});

await runTest("regularize password reveal panel shows API error message", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const utilsSource = await readModuleSource("utils/regularizeForm.ts");
  const passwordsStart = pageSource.indexOf('<DetailPanel title="Senha selecionada">');
  const sitesStart = pageSource.indexOf('{activeTab === "sites"', passwordsStart);
  const passwordsSource = pageSource.slice(passwordsStart, sitesStart);

  assert.match(utilsSource, /export function getRegularizeErrorMessage/);
  assert.match(utilsSource, /response\?\.data\?\.error/);
  assert.notEqual(passwordsStart, -1);
  assert.notEqual(sitesStart, -1);
  assert.match(
    passwordsSource,
    /getRegularizeErrorMessage\(\s*passwordDetailQuery\.error,\s*"Acesso negado ou indisponível\.",?\s*\)/,
  );
  assert.doesNotMatch(passwordsSource, /value="Acesso negado ou indisponível\."/);
});

await runTest("regularize credential empty detail states are centered", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const emptyStateMatches = pageSource.match(/<DetailEmptyState message="Sem revelação ativa\." \/>/g);

  assert.match(pageSource, /function DetailEmptyState/);
  assert.match(pageSource, /items-center justify-center text-center/);
  assert.ok((emptyStateMatches?.length ?? 0) >= 1);
  assert.doesNotMatch(pageSource, /<FieldLine label="Status" value="Sem revelação ativa\." \/>/);
});

await runTest("regularize site credential detail states are explicit", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const sitesStart = pageSource.indexOf('{activeTab === "sites"');
  const taxesStart = pageSource.indexOf('{activeTab === "taxes"', sitesStart);
  const sitesSource = pageSource.slice(sitesStart, taxesStart);

  assert.notEqual(sitesStart, -1);
  assert.notEqual(taxesStart, -1);
  assert.match(sitesSource, /Selecione um site para revelar credenciais/);
  assert.match(sitesSource, /Acesso negado para revelar credenciais/);
  assert.match(pageSource, /Credencial indispon[iÃ­]vel para revela[cÃ§][aÃ£]o/);
  assert.match(sitesSource, /getSiteCredentialDetailStatus\(sitePasswordDetailQuery\.error\)/);
  assert.match(pageSource, /getRegularizeErrorMessage\(error, "Credencial indisponivel para revelacao\."\)/);
  assert.match(pageSource, /403\|forbidden\|permission\|permiss\|acesso negado/);
  assert.doesNotMatch(sitesSource, /Acesso negado ou indispon[iÃ­]vel/);
});

await runTest("regularize credential empty layouts keep intentional detail behavior", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const passwordsStart = pageSource.indexOf('{activeTab === "passwords"');
  const sitesStart = pageSource.indexOf('{activeTab === "sites"', passwordsStart);
  const passwordsSource = pageSource.slice(passwordsStart, sitesStart);

  assert.match(pageSource, /const hasSiteRows = \(siteQuery\.data\?\.length \?\? 0\) > 0;/);
  assert.notEqual(passwordsStart, -1);
  assert.notEqual(sitesStart, -1);
  assert.match(passwordsSource, /<div className="space-y-3">/);
  assert.match(passwordsSource, /<label className="flex w-full flex-col/);
  assert.doesNotMatch(passwordsSource, /<label className="[^"]*max-w-/);
  assert.match(
    passwordsSource,
    /<QueryStatePanel\s+query=\{credentialQuery\}\s+emptyTitle="Nenhuma senha encontrada\."\s+emptyClassName="min-h-24 py-5"\s*>/,
  );
  assert.match(passwordsSource, /<DetailPanel title="Senha selecionada">/);
  assert.doesNotMatch(passwordsSource, /hasCredentialRows \? \(/);
  assert.doesNotMatch(passwordsSource, /emptyClassName="[^"]*xl:col-span-2[^"]*"/);
  assert.match(pageSource, /hasSiteRows \? \(\s*<DetailPanel title="Site selecionado">/);
  assert.match(pageSource, /<QueryStatePanel\s+query=\{siteTableQuery\}\s+emptyTitle="Nenhum site encontrado\."\s+emptyClassName="[^"]*xl:col-span-2[^"]*"/);
});

await runTest("regularize page uses the new module instead of the legacy mock screen", async () => {
  const pageSource = await readFile(join(appRoot, "src/pages/regularize.tsx"), "utf8");

  assert.match(pageSource, /@modules\/regularize/);
  assert.doesNotMatch(pageSource, /shared\/components\/newLayout\/Regularize/);
});

await runTest("regularize page derives write and reveal permissions from module access", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const typesSource = await readModuleSource("types.ts");

  assert.match(pageSource, /import \{ useModuleAccess \} from "@modules\/auth";/);
  assert.match(pageSource, /const \{ access: regularizeAccess \} = useModuleAccess\("regularize"\);/);
  assert.match(pageSource, /const canRevealCredentials = regularizeAccess\.canEdit;/);
  assert.match(pageSource, /const canManageRegularizeCore = regularizeAccess\.canEdit;/);
  assert.match(pageSource, /enabled: canRevealCredentials && isPasswordRevealContextActive/);
  assert.match(pageSource, /enabled: canRevealCredentials && isSitePasswordRevealContextActive/);
  assert.doesNotMatch(pageSource, /REGULARIZE_CAPABILITIES/);
  assert.doesNotMatch(pageSource, /hasCredentialRevealCapability/);
  assert.doesNotMatch(pageSource, /hasCoreWriteCapability/);
  assert.doesNotMatch(typesSource, /RegularizeCapability/);
});

await runTest("regularize boolean status labels stay user-facing", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /if \(typeof status === "boolean"\) \{/);
  assert.match(pageSource, /label: status \? "Ativo" : "Inativo"/);
  assert.doesNotMatch(pageSource, /label: status \? String\(status\) : "Ativo"/);
  assert.doesNotMatch(pageSource, /label: status \? String\(status\) : "Inativo"/);
});

await runTest("regularize municipal tax yes-no values normalize booleans", async () => {
  const municipalTaxSource = await readModuleSource(
    "components/RegularizeMunicipalTaxesForm.tsx",
  );

  assert.match(municipalTaxSource, /function toRegularizeYesNo/);
  assert.match(municipalTaxSource, /tlp_is_sent: toRegularizeYesNo\(municipalTax\.tlp_is_sent\)/);
  assert.match(municipalTaxSource, /tll_is_sent: toRegularizeYesNo\(municipalTax\.tll_is_sent\)/);
  assert.match(municipalTaxSource, /return normalized === "sim" \|\| normalized === "true" \? "Sim" : "Não";/);
});

await runTest("regularize mutations invalidate subdomain roots to avoid stale filtered lists", async () => {
  const credentialsSource = await readModuleSource("hooks/useRegularizeCredentials.ts");
  const peopleSource = await readModuleSource("hooks/useRegularizePeople.ts");
  const operationsSource = await readModuleSource("hooks/useRegularizeOperations.ts");

  assert.match(credentialsSource, /queryKey: regularizeQueryKeys\.credentials\(\)/);
  assert.match(peopleSource, /queryKey: regularizeQueryKeys\.people\(\)/);
  assert.match(operationsSource, /queryKey: regularizeQueryKeys\.operations\(\)/);
  assert.doesNotMatch(peopleSource, /regularizeQueryKeys\.clientPfs\(\{ status: payload\.status \}\)/);
  assert.doesNotMatch(operationsSource, /regularizeQueryKeys\.processes\(\{ status: payload\.status \}\)/);
  assert.doesNotMatch(operationsSource, /regularizeQueryKeys\.licenses\(\{ status: payload\.status \}\)/);
});

await runTest("regularize guardrail runs in the app aggregate test script", async () => {
  const packageSource = await readFile(join(appRoot, "package.json"), "utf8");
  const packageJson = JSON.parse(packageSource);

  assert.match(packageJson.scripts.test, /pnpm run test:regularize/);
});

await runTest("RegularizePage does not define primary mock arrays", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.doesNotMatch(pageSource, /const\s+(processes|permits|clients|passwords|partners)\s*=/);
  assert.doesNotMatch(pageSource, /api\.(get|post|put|delete)/);
});

await runTest("regularize selects clients in the header and shows the bound client in forms", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const formSources = await Promise.all(
    [
      "RegularizeLicenseForm.tsx",
      "RegularizeMunicipalTaxesForm.tsx",
      "RegularizePartnerForm.tsx",
      "RegularizePasswordForm.tsx",
      "RegularizeProcessForm.tsx",
    ].map((fileName) => readModuleSource(`components/${fileName}`)),
  );

  assert.match(pageSource, /ClientPickerModal/);
  assert.match(pageSource, /function openClientScopedForm/);
  assert.match(pageSource, /Selecione um cliente no cabeçalho antes de iniciar este cadastro\./);
  assert.equal((pageSource.match(/disabled=\{!currentCredentialClientId\}/g) ?? []).length, 7);
  assert.doesNotMatch(pageSource, /RegularizeClientPickerField/);
  formSources.forEach((formSource) => {
    assert.match(formSource, /ClientSelectionField/);
    assert.doesNotMatch(formSource, /RegularizeClientPickerField/);
  });
});
