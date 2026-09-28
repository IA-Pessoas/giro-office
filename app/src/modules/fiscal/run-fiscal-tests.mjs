import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const fiscalSources = {
  shell: await readSource("./components/FiscalShell.tsx"),
  ncmSection: await readSource("./components/FiscalNcmSection.tsx"),
  ncmForm: await readSource("./components/FiscalNcmFormPanel.tsx"),
  searchSection: await readSource("./components/FiscalSearchSection.tsx"),
  icmsSection: await readSource("./components/FiscalIcmsSection.tsx"),
  ipiSection: await readSource("./components/FiscalIpiSection.tsx"),
  queryKeys: await readSource("./hooks/queryKeys.ts"),
  ncmHook: await readSource("./hooks/useFiscalNcmList.ts"),
  icmsHook: await readSource("./hooks/useFiscalIcmsList.ts"),
  ipiHook: await readSource("./hooks/useFiscalIpiList.ts"),
  ncmMutations: await readSource("./hooks/useFiscalNcmMutations.ts"),
  icmsMutations: await readSource("./hooks/useFiscalIcmsMutations.ts"),
  ipiMutations: await readSource("./hooks/useFiscalIpiMutations.ts"),
  contract: await readSource("./services/fiscalService.contract.ts"),
  ncmClient: await readSource("./services/fiscalNcmService.ts"),
  icmsClient: await readSource("./services/fiscalIcmsService.ts"),
  ipiClient: await readSource("./services/fiscalIpiService.ts"),
  types: await readSource("./types/index.ts"),
  ncmSchema: await readSource("../../../../services/fiscal-service/src/schemas/ncm.schemas.ts"),
  icmsSchema: await readSource("../../../../services/fiscal-service/src/schemas/icms.schemas.ts"),
  ipiSchema: await readSource("../../../../services/fiscal-service/src/schemas/ipi.schemas.ts"),
  ncmRoute: await readSource("../../../../services/fiscal-service/src/routes/ncm.routes.ts"),
  icmsRoute: await readSource("../../../../services/fiscal-service/src/routes/icms.routes.ts"),
  ipiRoute: await readSource("../../../../services/fiscal-service/src/routes/ipi.routes.ts"),
  ncmRouteTest: await readSource("../../../../services/fiscal-service/src/test/ncm.routes.test.ts"),
  icmsRouteTest: await readSource("../../../../services/fiscal-service/src/test/icms.routes.test.ts"),
  ipiRouteTest: await readSource("../../../../services/fiscal-service/src/test/ipi.routes.test.ts"),
  authMiddleware: await readSource("../../../../services/fiscal-service/src/middlewares/isAuthenticated.ts"),
  ncmService: await readSource("../../../../services/fiscal-service/src/services/ncmService.ts"),
  icmsService: await readSource("../../../../services/fiscal-service/src/services/icmsService.ts"),
  ipiService: await readSource("../../../../services/fiscal-service/src/services/ipiService.ts"),
};

await runTest("fiscal derives write access from the fiscal module", () => {
  assert.match(fiscalSources.shell, /import \{ useModuleAccess \} from "@modules\/auth";/);
  assert.match(fiscalSources.shell, /const \{ access: fiscalAccess \} = useModuleAccess\("fiscal"\);/);
  assert.match(fiscalSources.shell, /canDelete=\{fiscalAccess\.isAdmin\}/);
  assert.match(fiscalSources.shell, /<FiscalNcmTab canEdit=\{canEdit\} canDelete=\{canDelete\} \/>/);
  assert.match(fiscalSources.shell, /<FiscalIcmsTab canEdit=\{canEdit\} canDelete=\{canDelete\} \/>/);
  assert.match(fiscalSources.shell, /<FiscalIpiTab canEdit=\{canEdit\} canDelete=\{canDelete\} \/>/);
  assert.match(fiscalSources.shell, /<FiscalNcmSection canEdit=\{canEdit\} canDelete=\{canDelete\} \/>/);
  assert.match(fiscalSources.shell, /<FiscalIcmsSection canEdit=\{canEdit\} canDelete=\{canDelete\} \/>/);
  assert.match(fiscalSources.shell, /<FiscalIpiSection canEdit=\{canEdit\} canDelete=\{canDelete\} \/>/);
});

await runTest("fiscal viewer keeps NCM, ICMS and IPI sections read-only", () => {
  for (const source of [fiscalSources.ncmSection, fiscalSources.icmsSection, fiscalSources.ipiSection]) {
    assert.match(source, /export function Fiscal\w+Section\(\{\s*canEdit,\s*canDelete,/);
    assert.match(source, /if \(panelIntent && canEdit\)/);
    assert.match(source, /onEdit=\{canEdit \? \(item\) => setPanelIntent/);
    assert.match(source, /\{onEdit \|\| onDelete \? \(/);
    assert.doesNotMatch(source, /onDelete=\{canEdit \?/);
  }
});

await runTest("fiscal admins can delete NCM, ICMS and IPI from the list", () => {
  for (const source of [fiscalSources.ncmSection, fiscalSources.icmsSection, fiscalSources.ipiSection]) {
    assert.match(source, /Trash2/);
    assert.match(source, /<ConfirmationDialog/);
    assert.match(source, /canDelete \? \(item\) => setDeleteTarget\(item\) : undefined/);
    assert.match(source, /onDelete=\{canDelete \?/);
    assert.match(source, /title="Excluir/);
    assert.match(source, /Confirmar exclus/);
  }

  assert.match(fiscalSources.ncmSection, /useDeleteFiscalNcmMutation/);
  assert.match(fiscalSources.icmsSection, /useDeleteFiscalIcmsMutation/);
  assert.match(fiscalSources.ipiSection, /useDeleteFiscalIpiMutation/);
});

await runTest("fiscal clients and hooks expose DELETE endpoints", () => {
  assert.match(fiscalSources.ncmClient, /async delete\(ncmId: string\): Promise<void>/);
  assert.match(fiscalSources.ncmClient, /api\.delete\(FISCAL_ENDPOINTS\.ncm/);
  assert.match(fiscalSources.icmsClient, /async delete\(icmsId: string\): Promise<void>/);
  assert.match(fiscalSources.icmsClient, /api\.delete\(FISCAL_ENDPOINTS\.icms/);
  assert.match(fiscalSources.ipiClient, /async delete\(ipiId: string\): Promise<void>/);
  assert.match(fiscalSources.ipiClient, /api\.delete\(FISCAL_ENDPOINTS\.ipi/);

  assert.match(fiscalSources.ncmMutations, /useDeleteFiscalNcmMutation/);
  assert.match(fiscalSources.ncmMutations, /mutationFn: \(id\) => fiscalNcmService\.delete\(id\)/);
  assert.match(fiscalSources.icmsMutations, /useDeleteFiscalIcmsMutation/);
  assert.match(fiscalSources.icmsMutations, /mutationFn: \(id\) => fiscalIcmsService\.delete\(id\)/);
  assert.match(fiscalSources.ipiMutations, /useDeleteFiscalIpiMutation/);
  assert.match(fiscalSources.ipiMutations, /mutationFn: \(id\) => fiscalIpiService\.delete\(id\)/);
});

await runTest("fiscal-service blocks viewer writes and allows editor writes", () => {
  assert.match(fiscalSources.authMiddleware, /const FISCAL_WRITE_PERMISSION = 2;/);

  for (const source of [
    fiscalSources.ncmRouteTest,
    fiscalSources.icmsRouteTest,
    fiscalSources.ipiRouteTest,
  ]) {
    assert.match(source, /function gatewayHeaders\(permission = 2\)/);
    assert.match(source, /\.set\(gatewayHeaders\(1\)\)/);
  }
});

await runTest("fiscal list hooks stay enabled for initial paginated listing", () => {
  for (const source of [fiscalSources.ncmHook, fiscalSources.icmsHook, fiscalSources.ipiHook]) {
    assert.doesNotMatch(source, /enabled:\s*enabled\s*&&[\s\S]*length\s*>\s*0/);
    assert.match(source, /page_size/);
    assert.match(source, /ListResult/);
  }
});

await runTest("fiscal list params include pagination and preserve current query", () => {
  assert.match(fiscalSources.types, /PaginatedResult/);
  assert.doesNotMatch(fiscalSources.queryKeys, /\.join\("\|"\)/);
  assert.match(fiscalSources.queryKeys, /\[\.\.\.\(filters\.ncmCodes \?\? \[\]\)\]/);
  assert.match(fiscalSources.queryKeys, /\[\.\.\.\(filters\.icmsCodes \?\? \[\]\)\]/);
  assert.match(fiscalSources.queryKeys, /\[\.\.\.\(filters\.ipiCodes \?\? \[\]\)\]/);

  for (const builder of [
    "buildFiscalNcmListParams",
    "buildFiscalIcmsListParams",
    "buildFiscalIpiListParams",
  ]) {
    const match = fiscalSources.contract.match(new RegExp(`function ${builder}[\\s\\S]*?\\n}`));
    const body = match?.[0] ?? "";
    assert.match(body, /page:\s*filters\.page/);
    assert.match(body, /page_size:\s*filters\.page_size/);
  }

  assert.match(fiscalSources.contract, /normalizePaginatedResult/);
});

await runTest("fiscal sections list on open, debounce search, clear search and paginate", () => {
  for (const source of [fiscalSources.ncmSection, fiscalSources.icmsSection, fiscalSources.ipiSection]) {
    assert.doesNotMatch(source, /hasSubmittedSearch/);
    assert.match(source, /useEffect/);
    assert.match(source, /setTimeout/);
    assert.match(source, /PaginationControls/);
    assert.match(source, /setPage\(\(currentPage\) => currentPage \+ 1\)/);
    assert.match(source, /setFilterValue\(""\)/);
  }

  assert.doesNotMatch(fiscalSources.ipiSection, /NCM_CODE_LENGTH|\\d\{8\}/);
});

await runTest("fiscal tables use centered headers, balanced cells and icon-only edit actions", () => {
  for (const source of [fiscalSources.ncmSection, fiscalSources.icmsSection, fiscalSources.ipiSection]) {
    assert.match(source, /Pencil/);
    assert.match(source, /py-2\.5 text-center text-\[11px\] font-semibold uppercase/);
    assert.match(source, /text-sm leading-5/);
    assert.match(source, /align-middle hover:bg-gray-50/);
    assert.match(source, /ACTION_BUTTON_CLASSNAME =\s*\n\s*"inline-flex h-8 w-8/);
    assert.match(source, /aria-label=\{`Editar/);
    assert.match(source, /<Pencil className="h-3\.5 w-3\.5"/);
    assert.doesNotMatch(source, />\s*Editar\s*<\/button>/);
  }

  assert.match(fiscalSources.ncmSection, />\s*Tributação\s*</);
  assert.match(fiscalSources.ncmSection, />\s*Início\s*</);
  assert.match(fiscalSources.ncmSection, />\s*Fim\s*</);
  assert.match(fiscalSources.ncmSection, />\s*Ação\s*</);
  assert.match(fiscalSources.ncmSection, /w-\[12%\][\s\S]*w-\[26%\][\s\S]*w-\[18%\][\s\S]*w-\[16%\][\s\S]*w-\[11%\][\s\S]*w-\[10%\][\s\S]*w-\[7%\]/);
  assert.match(fiscalSources.ncmSection, /:\s*"Sem fim"/);
  assert.match(fiscalSources.icmsSection, />\s*Conv\.\s*</);
  assert.match(fiscalSources.icmsSection, />\s*MVA apl\.\s*</);
  assert.match(fiscalSources.icmsSection, /w-\[8%\][\s\S]*w-\[24%\][\s\S]*w-\[10%\][\s\S]*w-\[10%\][\s\S]*w-\[16%\][\s\S]*w-\[9%\][\s\S]*w-\[9%\][\s\S]*w-\[8%\][\s\S]*w-\[6%\]/);
  assert.match(fiscalSources.ipiSection, />\s*Alíq\.\s*</);
  assert.match(fiscalSources.ipiSection, /w-\[24%\][\s\S]*w-\[12%\][\s\S]*w-\[38%\][\s\S]*w-\[16%\][\s\S]*w-\[10%\]/);
});

await runTest("fiscal-service list schemas accept optional terms and pagination", () => {
  for (const source of [fiscalSources.ncmSchema, fiscalSources.icmsSchema, fiscalSources.ipiSchema]) {
    assert.match(source, /paginationQuerySchema/);
    assert.match(source, /commaSeparatedListSchema/);
    assert.doesNotMatch(source, /\.min\(1, .*obrigat/);
  }
});

await runTest("NCM create and edit keep codes numeric while search keeps eight-digit behavior", () => {
  assert.match(fiscalSources.ncmForm, /handleChange\("ncm_code", value\.replace\(\/\\D\/g, ""\)\)/);
  assert.match(fiscalSources.ncmForm, /inputMode="numeric"/);
  assert.match(fiscalSources.ncmForm, /pattern="\[0-9\]\*"/);
  assert.match(fiscalSources.ncmForm, /Informe apenas números no código NCM\./);
  assert.match(fiscalSources.ncmForm, /ncm_code\.trim\(\)\.length !== 8[\s\S]*O código NCM deve ter 8 dígitos\./);
  assert.match(fiscalSources.ncmForm, /endDateIso && endDateIso < startDateIso[\s\S]*A vigência final não pode ser anterior à vigência inicial\./);
  assert.match(fiscalSources.ncmSchema, /O código NCM deve ter 8 dígitos\./);
  assert.doesNotMatch(fiscalSources.ncmSchema, /validity_end_date não pode/);
  assert.match(fiscalSources.ncmSchema, /\.regex\(\/\^\\d\+\$\//);
  assert.match(fiscalSources.searchSection, /\.replace\(\/\\D\/g, ""\)\s*\.slice\(0, NCM_CODE_LENGTH\)/);
  assert.match(fiscalSources.searchSection, /trimmedCode\.length !== NCM_CODE_LENGTH/);
});

await runTest("fiscal search keeps the typed code and clears stale results on invalid input", () => {
  assert.doesNotMatch(fiscalSources.searchSection, /setInputValue\(""\)/);
  assert.match(fiscalSources.searchSection, /function rejectSearch\(message: string\)[\s\S]*setSubmittedCode\(undefined\)[\s\S]*setStoredSearch\(null\)[\s\S]*removeItem\(LAST_FISCAL_SEARCH_STORAGE_KEY\)/);
  assert.doesNotMatch(fiscalSources.searchSection, /setValidationMessage\("/);
  assert.match(fiscalSources.searchSection, /!searchQuery\.isPlaceholderData/);
  assert.match(fiscalSources.searchSection, /storedSearch\?\.code === submittedCode/);
  assert.match(fiscalSources.searchSection, /setInputValue\(restoredSearch\.code\)/);
});

await runTest("NCM list filters by the code just created", () => {
  assert.match(fiscalSources.ncmForm, /onCreated\?: \(ncmCode: string\) => void/);
  assert.match(fiscalSources.ncmForm, /} else \{\s*await createMutation\.mutateAsync\(basePayload\);[^}]*onCreated\?\.\(basePayload\.ncm_code\);\s*}/);
  assert.match(fiscalSources.ncmSection, /onCreated=\{showCreatedNcm\}/);
  assert.match(fiscalSources.ncmSection, /function showCreatedNcm\(ncmCode: string\)[\s\S]*setFilterValue\(ncmCode\)[\s\S]*setSearchCodes\(\[ncmCode\]\)[\s\S]*setPage\(1\)/);
});

await runTest("fiscal-service list routes pass pagination and optional search terms", () => {
  for (const source of [fiscalSources.ncmRoute, fiscalSources.icmsRoute, fiscalSources.ipiRoute]) {
    assert.match(source, /page:\s*req\.query\.page/);
    assert.match(source, /page_size:\s*req\.query\.page_size/);
    assert.match(source, /service\.list\(\s*\{[\s\S]*page:\s*query\.page[\s\S]*page_size:\s*query\.page_size/);
  }
});

await runTest("fiscal-service lists use partial search and paginated result metadata", () => {
  for (const source of [fiscalSources.ncmService, fiscalSources.icmsService, fiscalSources.ipiService]) {
    assert.match(source, /count\(\{ where \}\)/);
    assert.match(source, /contains/);
    assert.match(source, /mode:\s*"insensitive"/);
    assert.match(source, /skip,\s*\n\s*take,/);
    assert.match(source, /hasMore:\s*page \* take < total/);
  }
});

await runTest("fiscal NCM shows tax regime name instead of legacy code", async () => {
  const { formatFiscalTaxRegime } = await import("./utils/fiscalTaxRegime.ts");
  assert.equal(formatFiscalTaxRegime("0"), "Simples Nacional");
  assert.equal(formatFiscalTaxRegime("1"), "Lucro Presumido");
  assert.equal(formatFiscalTaxRegime("2"), "Lucro Real");
  assert.equal(formatFiscalTaxRegime("Simples Nacional"), "Simples Nacional");
  assert.match(fiscalSources.ncmSection, /formatFiscalTaxRegime\(item\.tax_regime\)/);
});

await runTest("fiscal revenue amount distinguishes informed zero from invalid input", async () => {
  const { formatCompetenceLabel, formatRevenueAmount, toRevenueAmount } = await import(
    "./utils/fiscalRevenue.ts"
  );
  assert.equal(toRevenueAmount("R$ 1.234,5"), "1234.50");
  assert.equal(toRevenueAmount("R$ 0"), "0.00");
  assert.equal(toRevenueAmount(""), null);
  assert.equal(toRevenueAmount("R$ "), null);
  assert.equal(toRevenueAmount("-5"), null);
  assert.equal(formatRevenueAmount("1234.5"), "R$ 1.234,50");
  assert.equal(formatCompetenceLabel("2026-08"), "08/2026");
});

await runTest("fiscal revenues tab keeps loading, error, empty and validation states", async () => {
  const section = await readSource("./components/FiscalRevenuesSection.tsx");
  assert.match(fiscalSources.shell, /<FiscalRevenuesSection canEdit=\{canEdit\} \/>/);
  assert.match(section, /role="status"[^>]*>Carregando receitas/);
  assert.match(section, /list\.error \? <p role="alert"/);
  assert.match(section, /Nenhuma receita registrada para este cliente/);
  assert.match(section, /id="fiscal-revenue-amount-error" role="alert"/);
  assert.match(section, /if \(value === null\) \{\s*setAmountError/);
  // Visualizador só consulta: sem formulário nem ação de correção.
  assert.match(section, /\{client && canEdit \? \(\s*<form/);
  assert.match(section, /\{canEdit \? \(\s*<td/);
});

await runTest("fiscal Simples preview formats rates and shows base, states and taxes", async () => {
  const { formatRatePercent } = await import("./utils/fiscalRevenue.ts");
  assert.equal(formatRatePercent("1.3600"), "1,36%");
  assert.equal(formatRatePercent("2.0025"), "2,0025%");
  assert.equal(formatRatePercent("2.40865"), "2,4087%");

  const preview = await readSource("./components/FiscalSimplesPreviewSection.tsx");
  const revenues = await readSource("./components/FiscalRevenuesSection.tsx");
  assert.match(revenues, /<FiscalSimplesPreviewSection clientId=\{client\.id\} \/>/);
  // Corrigir receita invalida a prévia pelo mesmo prefixo de query.
  const queryKeys = await readSource("./hooks/queryKeys.ts");
  assert.match(preview, /fiscalSimplesPreviewQueryKey\(clientId, competence\)/);
  assert.match(queryKeys, /\[\.\.\.fiscalRevenuesQueryKey\(clientId\), "simples-preview", competence\]/);
  assert.match(revenues, /invalidateQueries\(\{ queryKey: fiscalRevenuesQueryKey\(/);
  assert.match(preview, /role="status"[^>]*>Calculando prévia/);
  assert.match(preview, /preview\.error \? <p role="alert"/);
  assert.match(preview, /\(média estimada\)/);
  assert.match(preview, /\(sem registro\)/);
  assert.match(preview, /RBT12/);
  assert.match(preview, /Anexo \{item\.annex\} · \{item\.tax\}/);
  // Sem base (RBT12 zero) ou acima do teto: mensagem, nenhum anexo.
  assert.match(preview, /data\.status === "ok" \? \(/);
  assert.match(preview, /\{data\.message\}/);
});
