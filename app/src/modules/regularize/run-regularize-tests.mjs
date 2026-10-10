import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRegularizeClientPfListParams,
  buildRegularizeDteNoticeListParams,
  buildRegularizeGuidanceListParams,
  buildRegularizeLicenseListParams,
  buildRegularizeMunicipalTaxesListParams,
  buildRegularizeProcessListParams,
  buildRegularizeSitePasswordListParams,
  REGULARIZE_DTE_NO_TIPO_FILTER,
  unwrapRegularizePage,
} from "./services/regularizeService.contract.ts";
import {
  buildRegularizeProcessStatusUpdatePayload,
  groupRegularizeProcessesByStatus,
} from "./utils/processBoard.ts";

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

await runTest(
  "guidance form supports optional process and coherent PJ PF manual targets",
  async () => {
    const source = await readModuleSource("components/RegularizeGuidanceForm.tsx");
    assert.match(source, /defaultProcessId\?: string/);
    assert.match(source, /processOptions\?: RegularizeFormOption\[\]/);
    assert.match(source, /REGULARIZE_GUIDANCE_TARGET_TYPES\.map/);
    assert.match(source, /ClientPickerModal/);
    assert.match(source, /RegularizeClientPfSelect/);
    assert.match(source, /legacyIntegrationStatusFilter: false/);
    assert.match(source, /target_type === "PJ"/);
    assert.match(source, /target_type === "PF"/);
    assert.match(source, /target_type === "SEM_CLIENTE"/);
    assert.match(source, /client_pj_id: "",\s*client_pf_id: ""/);
    assert.match(source, /source: "manual"/);
    assert.match(source, /!formState\.target_snapshot\.name\.trim\(\)/);
    assert.match(source, /process_id: formState\.process_id \|\| null/);
    assert.match(source, /Sem processo/);
    assert.doesNotMatch(source, /process_id: guidance\.process_id,/);
    assert.doesNotMatch(source, /if \(!formState\.process_id/);
    assert.doesNotMatch(source, /disabled=\{isEditing\}/);
    assert.doesNotMatch(source, /LegacyGuidanceDraft/);
  },
);

await runTest(
  "guidance form renders and submits the canonical checklist with conditional branch",
  async () => {
    const source = await readModuleSource("components/RegularizeGuidanceForm.tsx");
    const shared = await readFile(join(appRoot, "../shared/src/regularize/guidance.ts"), "utf8");
    assert.equal((shared.match(/code: "/g) ?? []).length, 17);
    assert.match(shared, /"Pendente",\s*"Concluído",\s*"Não se aplica"/);
    assert.match(source, /@workspace\/shared\/regularize/);
    assert.match(source, /checklist: REGULARIZE_GUIDANCE_CHECKLIST_ITEMS\.map/);
    assert.match(source, /REGULARIZE_GUIDANCE_CHECKLIST_ITEMS\.map\(\(\{ code, label \}\)/);
    assert.match(source, /REGULARIZE_GUIDANCE_CHECKLIST_STATUSES\.map/);
    assert.match(source, /<textarea\s+value=\{item\?\.observation \?\? ""\}/);
    assert.match(source, /item\.code === "branch" && item\.status === "Concluído"/);
    assert.match(source, /code === "branch" && status !== "Concluído"/);
    assert.match(source, /branch_data: null/);
    assert.match(source, /disabled=\{!isBranchCompleted\}/);
    assert.match(source, /branch_data:\s*isBranchCompleted\s*\?[\s\S]*?: undefined/);
    assert.match(source, /branch\.name\.trim\(\)/);
    assert.match(source, /branch\.address\.trim\(\)/);
    assert.match(source, /branch\.city\.trim\(\)/);
    assert.match(source, /branch\.state\.trim\(\)/);
    assert.match(source, /observation: item\?\.observation\?\.trim\(\) \?\? ""/);
    for (const field of [
      "type",
      "request",
      "framework_obs",
      "legal_nature",
      "company_name",
      "trade_name",
      "cpf_cnpj",
      "share_capital",
      "iptu",
      "address",
      "comporate_purpose",
      "carryng",
      "regime",
      "legal_representative",
      "status",
    ]) {
      assert.ok(source.includes(`formState.${field}`), `preserves legacy ${field}`);
    }
  },
);

await runTest(
  "guidance independent list preserves process scope permissions and mutation feedback",
  async () => {
    const page = await readModuleSource("components/RegularizePage.tsx");
    const form = await readModuleSource("components/RegularizeGuidanceForm.tsx");
    assert.match(page, /useRegularizeGuidance\(undefined, \{ enabled: true \}\)/);
    assert.match(page, /function IndependentGuidanceSection/);
    const independentSection = page.slice(
      page.indexOf("function IndependentGuidanceSection"),
      page.indexOf("function ProcessDetailContent"),
    );
    assert.match(
      independentSection,
      /canManageRegularizeCore \? \([\s\S]*?label="Nova orientação"/,
    );
    assert.doesNotMatch(independentSection, /currentProcessId/);
    assert.match(page, /regularizeAccess\.canView \? \(\s*<IndependentGuidanceSection/);
    assert.match(page, /onSetActiveForm\(\{ type: "guidance", mode: "create" \}\)/);
    assert.match(page, /<QueryStatePanel query=\{independentGuidanceQuery\}/);
    assert.match(page, /readOnly=\{!canManageRegularizeCore\}/);
    assert.match(page, /Somente leitura/);
    assert.match(page, /Orientação atualizada com sucesso/);
    assert.match(page, /Orientação criada com sucesso/);
    assert.match(page, /toast\.error\(message\);\s*throw new Error\(message\)/);
    assert.match(form, /disabled=\{readOnly \|\| isSubmitting\}/);
    assert.match(form, /if \(readOnly \|\| isSubmitting\)/);
    assert.match(form, /getRegularizeMutationErrorMessage/);
    assert.doesNotMatch(page, /LegacyGuidanceDraft/);
  },
);

await runTest(
  "guidance hardening preserves manual snapshots, API statuses and picker focus",
  async () => {
    const [guidanceSource, pickerSource] = await Promise.all([
      readModuleSource("components/RegularizeGuidanceForm.tsx"),
      readFile(join(appRoot, "src/modules/clients/components/ClientPickerModal.tsx"), "utf8"),
    ]);

    assert.match(
      guidanceSource,
      /const regularizeGuidanceStatusOptions = \["Em andamento", "Finalizado"\] as const;/,
    );
    assert.doesNotMatch(guidanceSource, /regularizeGuidanceStatusOptions,\s*/);
    assert.match(guidanceSource, /\.\.\.\(guidance\?\.target_snapshot \?\? \{\}\)/);
    assert.match(guidanceSource, /\.\.\.formState\.target_snapshot/);
    assert.match(
      guidanceSource,
      /cpf_cnpj: formatCpfCnpjInput\(guidance\.cpf_cnpj \?\? targetSnapshot\.cpf_cnpj \?\? ""\)/,
    );
    assert.match(guidanceSource, /guidance\.share_capital \?\? targetSnapshot\.share_capital/);
    assert.match(
      guidanceSource,
      /\.\.\.formState\.target_snapshot[\s\S]*?cpf_cnpj: normalizeDigits\(trimRegularizeOptionalText\(formState\.cpf_cnpj\) \?\? ""\)/,
    );
    assert.match(
      guidanceSource,
      /\.\.\.formState\.target_snapshot[\s\S]*?share_capital: toRegularizeOptionalNumber\(formState\.share_capital\)/,
    );
    assert.match(
      guidanceSource,
      /targetSnapshotAddress = formState\.target_snapshot\.address \?\? ""/,
    );
    assert.match(guidanceSource, /targetSnapshotCity = formState\.target_snapshot\.city \?\? ""/);
    assert.match(guidanceSource, /targetSnapshotState = formState\.target_snapshot\.state \?\? ""/);
    assert.match(guidanceSource, /targetSnapshotAddress\)/);
    assert.match(guidanceSource, /targetSnapshotCity\)/);
    assert.match(guidanceSource, /targetSnapshotState\)/);

    assert.match(pickerSource, /useRef/);
    assert.match(pickerSource, /useEffect/);
    assert.match(pickerSource, /searchInputRef\.current\?\.focus\(\)/);
    assert.match(pickerSource, /window\.addEventListener\("keydown",[\s\S]*?true\)/);
    assert.match(pickerSource, /window\.removeEventListener\("keydown",[\s\S]*?true\)/);
    assert.match(
      pickerSource,
      /function handleDialogKeyDown\(event: KeyboardEvent<HTMLDivElement>\)/,
    );
    assert.match(pickerSource, /onKeyDown=\{handleDialogKeyDown\}/);
    assert.match(pickerSource, /event\.preventDefault\(\)/);
    assert.match(pickerSource, /event\.stopPropagation\(\)/);
  },
);

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
    "/regularize/dte/import",
    "/regularize/dte/imports",
    "/regularize/dte/notices",
    "/regularize/dte/notices/reading",
    "/regularize/dte/queries",
    "/regularize/dte/queries/status",
    "/regularize/dte/queries/import",
    "/regularize/processes",
    "/regularize/process",
    "/regularize/process/send-to-fiscal",
    "/regularize/process/return-from-fiscal",
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

await runTest(
  "regularize guidance supports independent filters and guards empty scopes",
  async () => {
  const [
    typesSource,
    contractSource,
    serviceSource,
    queryKeysSource,
    operationsSource,
    pageSource,
  ] =
    await Promise.all([
      readModuleSource("types.ts"),
      readModuleSource("services/regularizeService.contract.ts"),
      readModuleSource("services/regularizeService.ts"),
      readModuleSource("hooks/queryKeys.ts"),
      readModuleSource("hooks/useRegularizeOperations.ts"),
      readModuleSource("components/RegularizePage.tsx"),
    ]);

  assert.match(typesSource, /@workspace\/shared\/regularize/);
  assert.match(typesSource, /export type RegularizeGuidanceChecklistInput/);
  assert.match(typesSource, /export type RegularizeGuidanceManualSnapshot/);
  assert.match(
    typesSource,
    /export type RegularizeGuidanceManualSnapshot[\s\S]*?source: "manual";/,
  );
  const createTypeSource = typesSource.match(
    /type RegularizeGuidanceCompletePayload[\s\S]*?export type LegacyGuidanceDraft/,
  )?.[0];
  assert.ok(createTypeSource);
  assert.match(createTypeSource, /checklist: RegularizeGuidanceChecklistInput\[\]/);
  assert.doesNotMatch(createTypeSource, /checklist_items/);
  assert.match(createTypeSource, /target_snapshot\?: RegularizeGuidanceManualSnapshot/);
  const updateTypeSource = typesSource.match(
    /export type UpdateRegularizeGuidancePayload[\s\S]*?export type AddRegularizeGuidanceActivityPayload/,
  )?.[0];
  assert.ok(updateTypeSource);
  assert.match(updateTypeSource, /id: RegularizeId;/);
  assert.match(updateTypeSource, /checklist\?: RegularizeGuidanceChecklistInput\[\]/);
  assert.doesNotMatch(updateTypeSource, /checklist_items/);
  assert.doesNotMatch(updateTypeSource, /economic_activities|partners/);
  assert.doesNotMatch(updateTypeSource, /status: string/);
  assert.match(
    typesSource,
    /type RegularizeGuidanceCreatePayloadFields[\s\S]*economic_activities[\s\S]*partners/,
  );
  assert.match(typesSource, /export type LegacyGuidanceDraft/);
  assert.match(typesSource, /process_id: RegularizeId \| null/);
  assert.match(contractSource, /target_type/);
  assert.match(
    serviceSource,
    /createGuidance[\s\S]{0,500}isLegacyGuidanceDraft[\s\S]{0,300}throw new Error/,
  );
  assert.match(
    serviceSource,
    /updateGuidance[\s\S]{0,500}economic_activities[\s\S]{0,200}partners[\s\S]{0,300}api\.put\(REGULARIZE_ENDPOINTS\.guidance, body\)/,
  );
  assert.match(queryKeysSource, /filters\.process_id \?\? ""/);
  assert.match(queryKeysSource, /filters\.target_type \?\? ""/);
  assert.match(operationsSource, /function shouldEnableRegularizeGuidanceQuery/);
  assert.match(operationsSource, /"process_id" in filters/);
  assert.match(operationsSource, /"target_type" in filters/);
  assert.match(operationsSource, /!hasEmptyProcessFilter/);
  assert.match(operationsSource, /!hasEmptyTargetFilter/);
  assert.match(operationsSource, /Boolean\(filters\.process_id \|\| filters\.target_type\)/);
  assert.match(operationsSource, /const hasExplicitAllFilters/);
  assert.match(operationsSource, /const hasEffectiveGuidanceFilter/);
  assert.match(
    operationsSource,
    /return \(hasExplicitAllFilters \|\| hasEffectiveGuidanceFilter\) && \(options\?\.enabled \?\? true\)/,
  );
  assert.match(
    pageSource,
    /const guidanceQuery = useRegularizeGuidance\(\s*currentProcessId \? \{ process_id: currentProcessId \} : undefined,\s*\{ enabled: queryPolicy\.guidance && Boolean\(currentProcessId\) \},\s*\);/,
  );
  assert.match(
    pageSource,
    /function handleRefreshRegularize\(\) \{[\s\S]*?if \(queryPolicy\.guidance && Boolean\(currentProcessId\)\)\s*refreshes\.push\(guidanceQuery\.refetch\(\)\);/,
  );
  assert.match(
    serviceSource,
    /api\.post\(REGULARIZE_ENDPOINTS\.guidance, payload\)/,
  );
  assert.doesNotMatch(serviceSource, /checklist_items/);

  assert.deepEqual(buildRegularizeGuidanceListParams({}), {});
  assert.deepEqual(
    buildRegularizeGuidanceListParams({ process_id: "process-1", target_type: "PJ" }),
    { process_id: "process-1", target_type: "PJ" },
  );
  assert.deepEqual(
    buildRegularizeGuidanceListParams({ process_id: "", target_type: "PF" }),
    { target_type: "PF" },
  );
  },
);

await runTest("regularize licenses list uses paginated hook and keeps mutation invalidation", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const operationsSource = await readModuleSource("hooks/useRegularizeOperations.ts");
  const contractSource = await readModuleSource("services/regularizeService.contract.ts");

  assert.match(
    pageSource,
    /const licensePageQuery = usePaginatedRegularizeLicenses\(\s*\{\s*status: licenseStatus,\s*page: licensePage,\s*limit: REGULARIZE_PAGE_SIZE,\s*\},\s*\{ enabled: activeTab === "licenses" \},\s*\);/,
  );
  assert.match(pageSource, /const \[licenseStatus, setLicenseStatus\] = useState\("Todos"\)/);
  assert.match(pageSource, /regularizeLicenseStatusFilterOptions/);
  assert.match(pageSource, /getRegularizeLicenseDisplayStatus\(item\.status, item\.due_date\)/);
  assert.match(pageSource, /const \[licensePage, setLicensePage\] = useState\(1\)/);
  assert.match(pageSource, /<PaginationControls[\s\S]{0,220}licensePageQuery\.data\?\.hasMore/);
  assert.deepEqual(
    buildRegularizeLicenseListParams({ status: "Ativo", page: 2, limit: 20 }),
    { status: "Ativo", page: 2, limit: 20 },
  );
  assert.match(
    operationsSource,
    /export function usePaginatedRegularizeLicenses/,
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

await runTest("regularize license protocol uses private upload and on-demand signed access", async () => {
  const formSource = await readModuleSource("components/RegularizeLicenseForm.tsx");
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const serviceSource = await readModuleSource("services/regularizeService.ts");
  const contractSource = await readModuleSource("services/regularizeService.contract.ts");

  assert.match(
    formSource,
    /accept="\.pdf,\.jpg,\.jpeg,\.png,\.webp,application\/pdf,image\/jpeg,image\/png,image\/webp"/,
  );
  assert.match(formSource, /LICENSE_PROTOCOL_MAX_SIZE_BYTES = 10 \* 1024 \* 1024/);
  assert.match(formSource, /Um novo envio substitui o protocolo vigente/);
  assert.match(formSource, /onOpenProtocol/);
  assert.match(contractSource, /licenseProtocol: \(id: RegularizeId\)/);
  assert.match(serviceSource, /formData\.append\("file", file\)/);
  assert.match(serviceSource, /api\.get\(REGULARIZE_ENDPOINTS\.licenseProtocol\(id\)\)/);
  assert.match(pageSource, /useUploadRegularizeLicenseProtocolMutation/);
  assert.match(pageSource, /useRegularizeLicenseProtocolAccessMutation/);
  assert.match(pageSource, /protocolWindow\.location\.replace\(access\.url\)/);
});

await runTest("regularize license upload failure retries from the persisted license", async () => {
  const { submitRegularizeLicense } = await import(
    "./services/regularizeLicenseSubmission.ts"
  );
  const formSource = await readModuleSource("components/RegularizeLicenseForm.tsx");
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const createPayload = {
    client_id: "client-1",
    has: true,
    type_license: "Alvará",
    entry_date: "2026-09-19",
    protocol: "PROTO-1",
    status: "Em Andamento",
    current_situation: "Em análise",
    contact: "Contato",
    urgency: "Média",
    type: "Anual",
  };
  const protocolFile = {
    name: "protocolo.pdf",
    size: 128,
    type: "application/pdf",
  };
  const persistedLicenseId = "license-1";
  const calls = [];
  let uploadAttempt = 0;
  let retryLicenseId;

  const dependencies = {
    createLicense: async (payload) => {
      calls.push(["POST", payload]);
      return { id: persistedLicenseId };
    },
    updateLicense: async (payload) => {
      calls.push(["PUT", payload]);
      return { id: payload.id };
    },
    uploadProtocol: async ({ id, file }) => {
      calls.push(["UPLOAD", id, file]);
      uploadAttempt += 1;
      if (uploadAttempt === 1) {
        throw new Error("synthetic upload failure");
      }
    },
    onLicenseSaved: ({ id, operation }) => {
      calls.push(["SAVED", operation, id]);
      retryLicenseId = id;
    },
  };

  await assert.rejects(
    submitRegularizeLicense(createPayload, protocolFile, dependencies),
    /synthetic upload failure/,
  );
  assert.equal(retryLicenseId, persistedLicenseId);

  await submitRegularizeLicense(
    { ...createPayload, id: retryLicenseId },
    protocolFile,
    dependencies,
  );

  assert.deepEqual(
    calls.map(([operation]) => operation),
    ["POST", "SAVED", "UPLOAD", "PUT", "SAVED", "UPLOAD"],
  );
  assert.equal(calls.filter(([operation]) => operation === "POST").length, 1);
  assert.equal(calls.filter(([operation]) => operation === "PUT").length, 1);
  assert.equal(calls.filter(([operation]) => operation === "UPLOAD").length, 2);
  assert.equal(calls[2][2], protocolFile);
  assert.equal(calls[5][2], protocolFile);
  assert.match(pageSource, /submitRegularizeLicense\(/);
  assert.match(
    pageSource,
    /isCreateSubmission && persistedLicenseId[\s\S]*mode: "edit", id: persistedLicenseId/,
  );
  assert.match(pageSource, /A licença foi salva, mas não foi possível armazenar o protocolo/);
  assert.match(pageSource, /key=\{licenseFormSessionKey\}/);
  assert.doesNotMatch(
    formSource,
    /useEffect\(\(\) => \{[\s\S]*?setFormState\(buildLicenseFormState[\s\S]*?setProtocolFile\(null\)[\s\S]*?\}, \[defaultClientId, license, open\]\)/,
  );
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
  assert.match(selectSource, /placeholder="Nome, código ou CPF"/);
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

await runTest("regularize PF selector uses a clear modal list with keyboard-friendly states", async () => {
  const selectSource = await readModuleSource("components/RegularizeClientPfSelect.tsx");
  const partnerSource = await readModuleSource("components/RegularizePartnerForm.tsx");

  assert.match(selectSource, /<Dialog\s+open=\{isOpen\}/);
  assert.match(selectSource, /aria-haspopup="dialog"/);
  assert.match(selectSource, /aria-expanded=\{isOpen\}/);
  assert.match(selectSource, /title="Selecionar cliente PF"/);
  assert.match(selectSource, /placeholder="Nome, código ou CPF"/);
  assert.match(selectSource, /role="listbox"/);
  assert.match(selectSource, /role="option"/);
  assert.match(selectSource, /aria-selected=\{/);
  assert.match(selectSource, /useRef/);
  assert.match(selectSource, /onKeyDown=\{\(event\) => handleOptionKeyDown/);
  assert.match(selectSource, /ArrowDown/);
  assert.match(selectSource, /ArrowUp/);
  assert.match(selectSource, /Home/);
  assert.match(selectSource, /End/);
  assert.match(selectSource, /useEffect/);
  assert.match(selectSource, /setActiveOptionIndex\(\(current\) => Math\.min\(current, options\.length\)\)/);
  assert.match(selectSource, /function handlePageChange/);
  assert.match(selectSource, /totalPages/);
  assert.match(selectSource, /onPageChange/);
  assert.match(selectSource, /total > 0 \?/);
  assert.match(selectSource, /Selecionar cliente PF/);
  assert.doesNotMatch(selectSource, /<RegularizeNativeSelect/);
  assert.match(partnerSource, /className="space-y-5"/);
  assert.match(partnerSource, /className="grid gap-5 md:grid-cols-2"/);
  assert.match(partnerSource, /fieldset className="flex min-w-0 flex-col/);
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
  assert.match(hookSource, /regularizeQueryKeys\.dashboard\(year, scope\)/);
  assert.match(queryKeysSource, /dashboardRoot/);
  assert.match(queryKeysSource, /dashboard: \(year: number, scope:/);
});

await runTest("regularize mutations invalidate aggregate dashboard data", async () => {
  for (const hookPath of [
    "hooks/useRegularizeCredentials.ts",
    "hooks/useRegularizePeople.ts",
    "hooks/useRegularizeOperations.ts",
  ]) {
    const source = await readModuleSource(hookPath);
    assert.match(source, /regularizeQueryKeys\.(?:dashboardRoot\((?:scope)?\)|root)/);
  }
});

await runTest("regularize dashboard enables only its aggregate query", async () => {
  const { getRegularizeQueryPolicy } = await import("./utils/regularizeQueryPolicy.ts");

  assert.deepEqual(getRegularizeQueryPolicy("dashboard"), {
    dashboard: true,
    clientPfs: false,
    sitePasswords: false,
    municipalTaxes: false,
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

  assert.match(apiSource, /notifyServerError\(toast, error\)/);
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
  // Lista completa de processos só alimenta o formulário de orientação (#1347).
  assert.match(pageSource, /useRegularizeProcesses\(\s*\{ status: "Todos" \},\s*\{ enabled: activeForm\?\.type === "guidance" \}/);
  assert.match(
    pageSource,
    /if \(activeTab === "processes"\)\s*\{\s*refreshes\.push\(\(processView === "board" \? processBoardQuery : processPageQuery\)\.refetch\(\)\);/,
  );
  assert.match(pageSource, /enabled: activeTab === "licenses"/);
  assert.match(pageSource, /dashboardQuery\.data\.metrics/);
  assert.match(pageSource, /getRegularizeRequestId\(dashboardQuery\.error\)/);
  assert.doesNotMatch(pageSource, /const metricData = useMemo/);
});

await runTest("regularize process board uses the existing filter and detail flow", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /const \[processView, setProcessView\] = useState<"table" \| "board">\("table"\)/);
  assert.match(pageSource, /useRegularizeProcesses\(\s*\{\s*status: processStatus,\s*search: debouncedProcessSearch\s*\}/);
  assert.match(pageSource, /enabled:\s*activeTab === "processes" && processView === "board"/);
  assert.match(pageSource, /enabled: activeTab === "processes" && processView === "table"/);
  assert.match(pageSource, /const hasProcessRows = processView === "board"\s*\? \(processBoardQuery\.data\?\.length \?\? 0\) > 0\s*:\s*visibleProcessRows\.length > 0;/);
  assert.match(pageSource, /aria-pressed=\{processView === "board"\}/);
  assert.match(pageSource, /<RegularizeProcessBoard[\s\S]{0,1000}onOpenProcessDetail=\{openProcessDetail\}/);
  assert.match(pageSource, /canChangeStatus=\{canManageRegularizeCore\}/);
  assert.match(pageSource, /const \[movingProcessIds, setMovingProcessIds\] = useState<Set<string>>\(\(\) => new Set\(\)\);/);
  assert.match(pageSource, /if \(!canManageRegularizeCore \|\| movingProcessIdsRef\.current\.has\(processId\)\)/);
  assert.match(pageSource, /async function handleMoveProcessStatus\(/);
  assert.match(pageSource, /regularizeService\.getProcess\(processId\)/);
  assert.match(pageSource, /buildRegularizeProcessStatusUpdatePayload\(process, status\)/);
  assert.match(pageSource, /updateProcessMutation\.mutateAsync\(/);
  assert.match(pageSource, /movingProcessIds=\{movingProcessIds\}/);
  assert.match(pageSource, /Não foi possível atualizar o status do processo\./);
  assert.match(pageSource, /processView === "table"/);
});

await runTest("process board exposes status moves only for editable users", async () => {
  const boardSource = await readModuleSource("components/RegularizeProcessBoard.tsx");

  assert.match(boardSource, /movingProcessIds: ReadonlySet<string>/);
  assert.match(boardSource, /if \(!canChangeStatus \|\| movingProcessIds\.has\(processId\)\) return;/);
  assert.match(boardSource, /delete next\[processId\]/);
  assert.match(boardSource, /draggable=\{canChangeStatus && !movingProcessIds\.has\(item\.id\)\}/);
  assert.match(
    boardSource,
    /regularizeProcessStatusOptions\.includes\(column\.status as RegularizeProcessStatus\)/,
  );
  assert.match(boardSource, /htmlFor=\{`move-process-\$\{item\.id\}`\}/);
  assert.match(boardSource, /disabled=\{!canChangeStatus \|\| movingProcessIds\.has\(item\.id\)\}/);
  assert.match(boardSource, /onMoveProcessStatus\(processId, status\)/);
  assert.match(boardSource, /delete next\[processId\]/);
});

await runTest("process status payload preserves editable fields", () => {
  const process = {
    id: "process-1",
    client_pj_id: "client-1",
    cpf_cnpj: "12345678000199",
    process_type: "Abertura",
    description: "Abrir filial",
    entry_date: "2026-09-01",
    completion_date: "2026-10-01",
    expected_date: "2026-10-15",
    client_notice_date: "2026-09-15",
    status: "Pendente",
    financial_status: "Regular",
    responsible1_id: "user-1",
    responsible2_id: "user-2",
    responsible3_id: "user-3",
    locking_type: "Manual",
    urgency: "Alta",
    task_id: "task-1",
    observation: "Aguardando protocolo",
    clientPJ: { cpf_cnpj: "12345678000199" },
    clientPF: null,
    history: [{ id: "history-1" }],
    elapsed_days: 12,
  };

  const payload = buildRegularizeProcessStatusUpdatePayload(process, "Protocolado");

  assert.equal(payload.id, process.id);
  assert.equal(payload.client_pj_id, process.client_pj_id);
  assert.equal(payload.cpf_cnpj, process.cpf_cnpj);
  assert.equal(payload.process_type, process.process_type);
  assert.equal(payload.description, process.description);
  assert.equal(payload.entry_date, process.entry_date);
  assert.equal(payload.completion_date, process.completion_date);
  assert.equal(payload.expected_date, process.expected_date);
  assert.equal(payload.client_notice_date, process.client_notice_date);
  assert.equal(payload.financial_status, process.financial_status);
  assert.equal(payload.responsible1_id, process.responsible1_id);
  assert.equal(payload.responsible2_id, process.responsible2_id);
  assert.equal(payload.responsible3_id, process.responsible3_id);
  assert.equal(payload.locking_type, process.locking_type);
  assert.equal(payload.urgency, process.urgency);
  assert.equal(payload.task_id, process.task_id);
  assert.equal(payload.observation, process.observation);
  assert.equal(payload.status, "Protocolado");
  assert.equal("clientPJ" in payload, false);
  assert.equal("clientPF" in payload, false);
  assert.equal("history" in payload, false);
  assert.equal("elapsed_days" in payload, false);
});

await runTest("process board groups canonical, legacy and unknown statuses", () => {
  const columns = groupRegularizeProcessesByStatus([
    { id: "pending", process_type: "Abertura", status: "Pendente" },
    { id: "open", process_type: "Alteração", status: "Aberto" },
    { id: "in-progress", process_type: "Baixa", status: "Em andamento" },
    { id: "completed", process_type: "Licença", status: "Concluído" },
    { id: "paused", process_type: "Certidão", status: "Paralizado" },
    { id: "legacy", process_type: "Histórico", status: "Status legado" },
  ]);

  assert.deepEqual(
    columns.map(({ label, items }) => [label, items.map(({ id }) => id)]),
    [
      ["Pendente", ["pending"]],
      ["Em andamento", ["open", "in-progress"]],
      ["Protocolado", []],
      ["Finalizado", ["completed"]],
      ["Paralisado", ["paused"]],
      ["Outros status", ["legacy"]],
    ],
  );
});

await runTest("process board keeps canonical columns when no processes match", () => {
  const columns = groupRegularizeProcessesByStatus([]);

  assert.deepEqual(columns.map(({ label, items }) => [label, items]), [
    ["Pendente", []],
    ["Em andamento", []],
    ["Protocolado", []],
    ["Finalizado", []],
    ["Paralisado", []],
  ]);
});

await runTest("process list query key separates independent board searches", async () => {
  const queryKeysSource = await readModuleSource("hooks/queryKeys.ts");

  assert.match(
    queryKeysSource,
    /processes: \(filters: RegularizeProcessListFilters, scope: RegularizeQueryScope\) =>\s*\[\s*\.\.\.regularizeQueryKeys\.operations\(scope\),\s*"processes",\s*filters\.status,\s*filters\.search \?\? ""/,
  );
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

await runTest("regularize process contract keeps canonical states and explicit Fiscal actions", async () => {
  const [controlsSource, formSource, pageSource, contractSource, serviceSource, hooksSource, boardSource] =
    await Promise.all([
      readModuleSource("components/regularizeFormControls.tsx"),
      readModuleSource("components/RegularizeProcessForm.tsx"),
      readModuleSource("components/RegularizePage.tsx"),
      readModuleSource("services/regularizeService.contract.ts"),
      readModuleSource("services/regularizeService.ts"),
      readModuleSource("hooks/useRegularizeOperations.ts"),
      readModuleSource("utils/processBoard.ts"),
    ]);

  assert.match(boardSource, /regularizeProcessStatusOptions = \[\s*"Pendente",\s*"Andamento",\s*"Protocolado",\s*"Finalizado",\s*"Paralisado",\s*\]/);
  assert.match(controlsSource, /import \{ regularizeProcessStatusOptions \} from "\.\.\/utils\/processBoard"/);
  assert.match(controlsSource, /export \{ regularizeProcessStatusOptions \}/);
  assert.match(
    controlsSource,
    /regularizeFinancialStatusOptions = \[\s*"Pendente",\s*"Regular",\s*"Bônus",\s*"Não Contratado",\s*\]/,
  );
  assert.match(formSource, /financial_status/);
  assert.match(formSource, /client_notice_date/);
  assert.match(formSource, /useAssignableUsers/);
  assert.match(formSource, /responsible1_id/);
  assert.match(formSource, /responsible2_id/);
  assert.match(formSource, /responsible3_id/);
  assert.match(contractSource, /sendToFiscal: "\/regularize\/process\/send-to-fiscal"/);
  assert.match(contractSource, /returnFromFiscal: "\/regularize\/process\/return-from-fiscal"/);
  assert.match(serviceSource, /api\.post\(REGULARIZE_ENDPOINTS\.sendToFiscal/);
  assert.match(serviceSource, /api\.post\(REGULARIZE_ENDPOINTS\.returnFromFiscal/);
  assert.match(hooksSource, /useSendRegularizeProcessToFiscalMutation/);
  assert.match(hooksSource, /useReturnRegularizeProcessFromFiscalMutation/);
  assert.match(pageSource, /Enviar ao Fiscal/);
  assert.match(pageSource, /Registrar retorno do Fiscal/);
  assert.match(pageSource, /Status financeiro/);
  assert.match(pageSource, /Aviso ao cliente/);
});

await runTest("regularize DTE notice filters send plain days and omit empty filters (#1745)", () => {
  const base = { from: "", to: "", tipo: "", search: "  ", reading: "Todos", page: 1, limit: 20 };

  // Período vazio pede tudo: sem from, a API aplicaria os 45 dias.
  assert.deepEqual(buildRegularizeDteNoticeListParams(base), {
    from: "1900-01-01",
    reading: "Todos",
    page: 1,
    limit: 20,
  });

  const params = buildRegularizeDteNoticeListParams({
    ...base,
    from: "2026-09-01",
    to: "2026-09-30",
    tipo: "badge-warning",
    search: " intima ",
    reading: "Pendente",
  });
  assert.deepEqual(params, {
    from: "2026-09-01",
    to: "2026-09-30",
    tipo: "badge-warning",
    search: "intima",
    reading: "Pendente",
    page: 1,
    limit: 20,
  });
  // "Sem cor" vai como tipo vazio, que a API entende como avisos sem selo.
  assert.equal(
    buildRegularizeDteNoticeListParams({ ...base, tipo: REGULARIZE_DTE_NO_TIPO_FILTER }).tipo,
    "",
  );
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
  assert.match(pageSource, /usePaginatedRegularizeLicenses/);
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
    "guidanceActivity",
    "guidancePartnerAdd",
    "guidancePartnerRemove",
    "guidancePartner",
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
    "useUpdateRegularizeGuidanceActivityMutation",
    "useAddRegularizeGuidancePartnerMutation",
    "useRemoveRegularizeGuidancePartnerMutation",
    "useUpdateRegularizeGuidancePartnerMutation",
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

await runTest("regularize partners follow the header client and name both sides (#1347)", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(
    pageSource,
    /useRegularizePartners\(\s*currentCredentialClientId\s*\?\s*\{ type: "pj", client_id: currentCredentialClientId \}/,
  );
  assert.match(pageSource, /item\.clientPF\?\.name \|\| "PF não identificado"/);
  assert.match(pageSource, /headerClientName \|\| "PJ não identificado"/);
  assert.match(pageSource, /headerClientDetailQuery\.data\?\.company_name/);
  assert.match(pageSource, /Selecione um cliente no topo para ver os sócios\./);
  assert.doesNotMatch(pageSource, /useClients\(/);
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

  // #1367: o campo delega ao FormField compartilhado, que marca o obrigatório com RequiredFieldLabel.
  assert.match(controlsSource, /<FormField[\s\S]*required=\{required\}/);
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
  assert.match(guidanceSource, /const regularizeGuidanceStatusOptions = \["Em andamento", "Finalizado"\] as const;/);
  assert.match(guidanceSource, /<RegularizeNativeSelect\s+value=\{formState\.status\}/);
  assert.match(licenseSource, /regularizeLicenseStatusOptions/);
  assert.match(licenseSource, /regularizeUrgencyOptions/);
  assert.match(licenseSource, /<RegularizeNativeSelect\s+value=\{formState\.status\}/);
  assert.match(licenseSource, /<RegularizeNativeSelect\s+value=\{formState\.urgency\}/);
  assert.match(
    controlsSource,
    /regularizeLicenseStatusOptions = \[\s*"Em Processo de Solicitação",\s*"Em Andamento",\s*"Finalizado",\s*"Paralisado",\s*\]/,
  );
});

await runTest("regularize PF uses fixed options, automatic code and field errors", async () => {
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");
  const clientPfSource = await readModuleSource("components/RegularizeClientPfForm.tsx");

  assert.match(controlsSource, /regularizeClientPfSexOptions/);
  assert.match(controlsSource, /regularizeClientPfMaritalStatusOptions/);
  assert.match(controlsSource, /regularizeClientPfStateOptions/);
  assert.match(clientPfSource, /regularizeClientPfSexOptions\.map/);
  assert.match(clientPfSource, /regularizeClientPfMaritalStatusOptions\.map/);
  assert.match(clientPfSource, /regularizeClientPfStateOptions\.map/);
  assert.match(clientPfSource, /generateClientPfCode/);
  assert.match(clientPfSource, /Gerado automaticamente/);
  const requiredFieldsBlock = clientPfSource.slice(
    clientPfSource.indexOf("const REQUIRED_CLIENT_PF_FIELDS"),
    clientPfSource.indexOf("type ClientPfFieldErrors"),
  );
  assert.doesNotMatch(requiredFieldsBlock, /"father"/);
  assert.match(clientPfSource, /fieldErrors/);
  assert.match(clientPfSource, /error=\{fieldErrors\.city\}/);
  assert.match(clientPfSource, /aria-invalid=\{Boolean\(fieldErrors\.city\)\}/);
  assert.match(clientPfSource, /<RegularizeFormError message=\{formError\} sticky=\{false\} \/>/);
  assert.match(clientPfSource, /<RegularizeFormField label="Pai">/);
});

await runTest("regularize process task uses the real task selector", async () => {
  const processSource = await readModuleSource("components/RegularizeProcessForm.tsx");
  const tasksHookSource = await readFile(
    join(appRoot, "src/modules/integracao/hooks/useIntegracaoTasks.ts"),
    "utf8",
  );

  assert.match(tasksHookSource, /options\??: \{\s*enabled\??: boolean/);
  assert.match(tasksHookSource, /enabled: options\.enabled \?\? true/);
  const taskSelectSource = await readModuleSource("components/RegularizeTaskSelect.tsx");
  assert.match(processSource, /<RegularizeTaskSelect\s+enabled=\{open\}\s+value=\{formState\.task_id\}/);
  assert.match(taskSelectSource, /useIntegracaoTasksList/);
  assert.match(taskSelectSource, /status: "Todos", limit: 100, search/);
  assert.match(taskSelectSource, /\{ enabled \}/);
  assert.match(taskSelectSource, /value=\{search\}/);
  assert.match(taskSelectSource, /options\.map/);
  assert.match(taskSelectSource, /tasksQuery\.isLoading/);
  assert.match(taskSelectSource, /tasksQuery\.error/);
  assert.match(taskSelectSource, /disabled=/);
  assert.match(taskSelectSource, /Nenhuma tarefa/);
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
  assert.match(pageSource, /Credencial indisponível para revelação/);
  assert.match(sitesSource, /getSiteCredentialDetailStatus\(sitePasswordDetailQuery\.error\)/);
  assert.match(pageSource, /getRegularizeErrorMessage\(error, "Credencial indisponível para revelação\."\)/);
  assert.match(pageSource, /403\|forbidden\|permission\|permiss\|acesso negado/);
  assert.doesNotMatch(sitesSource, /Acesso negado ou indispon[iÃ­]vel/);
});

await runTest("regularize site credential reveal opens a centered modal for the selected site", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const sitesStart = pageSource.indexOf('{activeTab === "sites"');
  const taxesStart = pageSource.indexOf('{activeTab === "taxes"', sitesStart);
  const sitesSource = pageSource.slice(sitesStart, taxesStart);

  assert.match(
    pageSource,
    /const \[isSiteCredentialDialogOpen, setIsSiteCredentialDialogOpen\] = useState\(false\)/,
  );
  assert.match(
    sitesSource,
    /setActiveSitePasswordId\(item\.id\)[\s\S]{0,100}setIsSiteCredentialDialogOpen\(true\)/,
  );
  assert.match(sitesSource, /<Dialog\s+open=\{isSiteCredentialDialogOpen\}/);
  assert.match(sitesSource, /sitePasswordDetailQuery\.data\.user/);
  assert.match(sitesSource, /sitePasswordDetailQuery\.data\.password/);
  assert.match(sitesSource, /sitePasswordDetailQuery\.data\.link/);
  assert.match(sitesSource, /Carregando\.\.\./);
  assert.match(sitesSource, /Acesso negado para revelar credenciais/);
  assert.match(sitesSource, /getSiteCredentialDetailStatus\(sitePasswordDetailQuery\.error\)/);
  assert.match(sitesSource, /Selecione um site para revelar credenciais/);
  assert.doesNotMatch(sitesSource, /<DetailPanel title="Site selecionado">/);
  assert.match(pageSource, /aria-label=\{title\}/);
  const siteEyeStart = sitesSource.indexOf("<TableActionButton", sitesSource.indexOf("<DataTable"));
  const siteEyeEnd = sitesSource.indexOf("/>", siteEyeStart);
  const siteEyeSource = sitesSource.slice(siteEyeStart, siteEyeEnd);
  assert.doesNotMatch(siteEyeSource, /disabled=\{!canRevealCredentials\}/);
});

await runTest("regularize credential empty layouts keep intentional detail behavior", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const passwordsStart = pageSource.indexOf('{activeTab === "passwords"');
  const sitesStart = pageSource.indexOf('{activeTab === "sites"', passwordsStart);
  const passwordsSource = pageSource.slice(passwordsStart, sitesStart);

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
  assert.match(pageSource, /<Dialog\s+open=\{isSiteCredentialDialogOpen\}/);
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

  assert.match(credentialsSource, /queryKey: regularizeQueryKeys\.credentials\(scope\)/);
  assert.match(peopleSource, /queryKey: regularizeQueryKeys\.people\(scope\)/);
  assert.match(operationsSource, /queryKey: regularizeQueryKeys\.root/);
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

await runTest("partner form validates each field before submitting", async () => {
  const { validatePartnerForm } = await import("./utils/partnerForm.ts");
  const valid = { pf_id: "pf", part: "50", entry: "2024-01-15", exit: "" };

  assert.deepEqual(validatePartnerForm(valid), {});
  assert.deepEqual(validatePartnerForm({ ...valid, part: "150" }), {
    part: "Participação deve ser maior que 0% e no máximo 100%.",
  });
  assert.deepEqual(validatePartnerForm({ ...valid, part: "" }), {
    part: "Informe a participação em %.",
  });
  assert.deepEqual(validatePartnerForm({ ...valid, exit: "2020-01-15" }), {
    exit: "Data de saída não pode ser anterior à entrada.",
  });
  assert.deepEqual(
    validatePartnerForm({ ...valid, entry: "" }, { entryIncomplete: true, exitIncomplete: true }),
    {
      entry: "Informe a data de entrada completa (dd/mm/aaaa).",
      exit: "Informe a data de saída completa (dd/mm/aaaa).",
    },
  );
  assert.deepEqual(validatePartnerForm({ ...valid, pf_id: "" }), {
    pf_id: "Selecione a pessoa física.",
  });
});

await runTest("partner table shows masked CPF and distinct action tooltips", async () => {
  const source = await readFile(
    join(appRoot, "src/modules/clients/components/ClientPartnersSection.tsx"),
    "utf8",
  );

  assert.match(source, /formatCPF_CNPJ\(item\.clientPF\.cpf\)/);
  assert.match(source, /title="Editar pessoa física"/);
  assert.match(source, /title="Editar vínculo"/);
  assert.match(source, /excludePfIds=/);
  assert.match(source, /<ConfirmationDialog/);
  assert.doesNotMatch(source, /window\.confirm/);
});

await runTest("regularize dashboard and lists stay consistent with the tabs (#1347)", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.doesNotMatch(pageSource, /DashboardHeroCard/);
  assert.match(pageSource, /label="Processos abertos"/);
  assert.match(
    pageSource,
    /headers=\{\["Licença", "Cliente", "Protocolo", "Contato", "Status", "Vencimento", ""\]\}/,
  );
  assert.match(pageSource, /formatText\(item\.client_name\)/);
  assert.match(pageSource, /formatSiteSphere\(item\.sphere\)/);
  assert.match(pageSource, /formatSiteSphere\(item\.site\?\.sphere\)/);
});

await runTest("regularize forms avoid technical jargon and prefill the client document (#1347)", async () => {
  const processForm = await readModuleSource("components/RegularizeProcessForm.tsx");
  const licenseForm = await readModuleSource("components/RegularizeLicenseForm.tsx");

  for (const source of [processForm, licenseForm]) {
    assert.doesNotMatch(source, /Task ID|Buscar task/);
    assert.match(source, /<RegularizeTaskSelect/);
  }
  assert.match(processForm, /useClient\(/);
  // Preenchimento roda depois do reset do formulário, senão o documento some ao reabrir.
  assert.ok(
    processForm.indexOf("}, [defaultClientId, open, process]);") <
      processForm.indexOf("}, [open, pjClientDocument]);"),
  );
  assert.match(processForm, /list=\{processTypeListId\}/);

  const taskSelect = await readModuleSource("components/RegularizeTaskSelect.tsx");
  assert.match(taskSelect, /<legend[^>]*>Tarefa vinculada<\/legend>/);

  const { formatSiteSphere } = await import("./utils/regularizeForm.ts");
  assert.equal(formatSiteSphere("legacy"), "Não informado");
  assert.equal(formatSiteSphere("Municipal"), "Municipal");
  assert.equal(formatSiteSphere(null), "-");
});

await runTest("client picker warns when only active clients are listed (#1347)", async () => {
  const source = await readFile(
    join(appRoot, "src/modules/clients/components/ClientPickerModal.tsx"),
    "utf8",
  );

  assert.match(source, /filters\.status === "Ativo"/);
  assert.match(source, /Só clientes ativos aparecem aqui\./);
});
