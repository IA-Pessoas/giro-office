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
  assert.match(section, /<div role="status">\s*<FiscalStateBox icon=\{Loader2\} tone="loading" title="Carregando receitas"/);
  assert.match(section, /list\.error \? \(\s*<div role="alert">/);
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
  assert.match(preview, /<div role="status">\s*<FiscalStateBox icon=\{Loader2\} tone="loading" title="Calculando prévia"/);
  assert.match(preview, /preview\.error \? \(\s*<div role="alert">/);
  // Meses sem receita entram como zero: a prévia avisa antes da emissão.
  assert.match(preview, /meses sem receita registrada entram/);
  assert.match(preview, /aria-invalid=\{isCompetence\(competence\) \? undefined : true\}/);
  assert.match(preview, /\(média estimada\)/);
  assert.match(preview, /\(sem registro\)/);
  assert.match(preview, /RBT12/);
  assert.match(preview, /Anexo \{item\.annex\} · \{item\.tax\}/);
  // Sem base (RBT12 zero) ou acima do teto: mensagem, nenhum anexo.
  assert.match(preview, /data\.status === "ok" \? \(/);
  assert.match(preview, /\{data\.message\}/);
});

await runTest("fiscal Simples preview emits one PDF per annex with the limited rate", async () => {
  const preview = await readSource("./components/FiscalSimplesPreviewSection.tsx");
  const client = await readSource("./services/fiscalRevenueService.ts");
  // Apuração do mês anterior; o PDF vale para o mês seguinte à apuração.
  assert.match(preview, /Competência de apuração/);
  assert.match(preview, /useState\(\(\) => competenceFromToday\(-1\)\)/);
  assert.match(preview, /Alíquota emitida para \{formatCompetenceLabel\(data\.applies_to\)\}/);
  // Botão só com alíquota válida; 6ª faixa explica por que não emite.
  assert.match(preview, /\{item\.emission_rate \? \(\s*<button/);
  assert.match(preview, /Emitir PDF · \{formatRatePercent\(item\.emission_rate\)\}/);
  assert.match(preview, /na 6ª faixa o \{item\.tax\} é recolhido fora do Simples/);
  // Erro de emissão vira toast com a mensagem do servidor, sem baixar arquivo.
  assert.match(preview, /catch \(error\) \{\s*toast\.error\(getFiscalErrorMessage\(error\)\);/);
  assert.match(client, /"\/fiscal\/simples\/pdf"/);
  assert.match(client, /error\.response\?\.data instanceof Blob/);
  assert.match(client, /error\.response\.data = JSON\.parse\(await error\.response\.data\.text\(\)\)/);
});

await runTest("fiscal Simples batch parses pasted documents and exports CSV for editors", async () => {
  const { nextCompetence, parseBatchDocuments } = await import("./utils/fiscalRevenue.ts");
  assert.deepEqual(parseBatchDocuments(" 12.345.678/0001-90\r\n\n44444444444; 99999999000199,\n"), [
    "12.345.678/0001-90",
    "44444444444",
    "99999999000199",
  ]);
  assert.equal(nextCompetence("2026-12"), "2027-01");

  const batch = await readSource("./components/FiscalSimplesBatchSection.tsx");
  const client = await readSource("./services/fiscalRevenueService.ts");
  assert.match(fiscalSources.shell, /\{canEdit \? <FiscalSimplesBatchSection \/> : null\}/);
  assert.match(client, /api\.post\("\/fiscal\/simples\/csv", payload\)/);
  // Validação local, ignorados com motivo e nenhum arquivo quando ninguém entra.
  assert.match(batch, /Informe ao menos um CPF\/CNPJ, um por linha\./);
  assert.match(batch, /\{item\.reason\}/);
  assert.match(client, /const file = batch\.included\.length\s*\?\s*new Blob\(\[batch\.csv\]/);
  // ZIP: só baixa quando o servidor devolveu arquivo; falha de geração vira toast, sem download.
  assert.match(client, /api\.post\("\/fiscal\/simples\/zip", payload\)/);
  assert.match(client, /const file = batch\.zip_base64\s*\?/);
  assert.match(batch, /if \(file\) \{\s*downloadFile\(file, batch\.file_name\);/);
  assert.match(batch, /Exportar PDFs \(ZIP\)/);
  assert.match(batch, /nenhum arquivo gerado/);
  assert.match(batch, /catch \(error\) \{\s*setResult\(null\);\s*toast\.error\(getFiscalErrorMessage\(error\)\);/);
});

await runTest("fiscal malhas formats dates, periods and history values", async () => {
  const { formatMalhaDate, formatMalhaHistoryValue, formatMalhaPeriod } = await import(
    "./utils/fiscalMalha.ts"
  );
  assert.equal(formatMalhaDate("2026-11-10"), "10/11/2026");
  assert.equal(formatMalhaDate(null), "Sem prazo");
  assert.equal(formatMalhaPeriod("2025-01", "2025-12"), "01/2025 a 12/2025");
  assert.equal(formatMalhaPeriod("2025-03", "2025-03"), "03/2025");
  const names = (id) => (id === "u1" ? "Ana" : undefined);
  assert.equal(formatMalhaHistoryValue("status", "aguardando_cliente", names), "Aguardando cliente");
  assert.equal(formatMalhaHistoryValue("responsible_id", "u1", names), "Ana");
  assert.equal(formatMalhaHistoryValue("responsible_id", "u2", names), "Usuário sem acesso atual");
  assert.equal(formatMalhaHistoryValue("responsible_id", null, names), "Nenhum");
  assert.equal(formatMalhaHistoryValue("deadline", null, names), "Sem prazo");
});

await runTest("fiscal malhas tab gates edits, keeps states and refreshes history", async () => {
  const section = await readSource("./components/FiscalMalhasSection.tsx");
  const client = await readSource("./services/fiscalMalhaService.ts");
  const queryKeys = await readSource("./hooks/queryKeys.ts");
  assert.match(fiscalSources.shell, /<FiscalMalhasSection canEdit=\{canEdit\} canTransfer=\{canDelete\} \/>/);
  assert.match(section, /disabled=\{Boolean\(editing\?\.responsible_id\) && !canTransfer\}/);
  assert.match(section, /<div role="status">\s*<FiscalStateBox icon=\{Loader2\} tone="loading" title="Carregando malhas"/);
  assert.match(section, /list\.error \? \(\s*<div role="alert">/);
  assert.match(section, /Nenhuma malha encontrada/);
  assert.match(section, /id="fiscal-malha-form-error" role="alert"/);
  // Nível 1 consulta e vê histórico; formulário, edição e anexo só com edição Fiscal.
  assert.match(section, /\{client && canEdit \? \(\s*<form/);
  assert.match(section, /\{canEdit \? \(\s*<>\s*<button type="button" onClick=\{\(\) => startEditing\(item\)\}/);
  assert.match(section, /useAssignableUsers\(\{ enabled: Boolean\(client\), module: "fiscal" \}\)/);
  // Salvar ou anexar invalida o prefixo que também cobre o histórico aberto.
  assert.match(queryKeys, /\[\.\.\.fiscalMalhasQueryKey\(clientId\), "detail", malhaId\]/);
  assert.match(section, /invalidateQueries\(\{ queryKey: fiscalMalhasQueryKey\(clientId\) \}\)/);
  assert.match(client, /form\.append\("file", file\)/);
  assert.match(section, /window\.open\(await fiscalMalhaService\.attachmentUrl\(id\), "_blank", "noopener,noreferrer"\)/);
});

await runTest("fiscal wholesale tab shows current value and history, editing gated", async () => {
  const section = await readSource("./components/FiscalWholesaleSection.tsx");
  const client = await readSource("./services/fiscalWholesaleService.ts");
  assert.match(fiscalSources.shell, /<FiscalWholesaleSection canEdit=\{canEdit\} \/>/);
  assert.match(section, /<div role="status">\s*<FiscalStateBox icon=\{Loader2\} tone="loading"/);
  assert.match(section, /state\.error \? \(\s*<div role="alert">/);
  // Nível 1 vê valor atual e histórico; só edição Fiscal alterna a marcação.
  assert.match(section, /\{canEdit \? \(\s*<button type="button" disabled=\{save\.isPending\}/);
  assert.match(section, /\{wholesaleLabel\(entry\.previous_value\)\} → \{wholesaleLabel\(entry\.new_value\)\}/);
  assert.match(section, /Não dispara nenhum cálculo/);
  assert.match(client, /api\(\)\.put\(`\/fiscal\/clients\/\$\{clientId\}\/wholesale`, \{\s*is_wholesale: isWholesale,/);
});

await runTest("fiscal Domínio × SEFAZ conference reads files and shows partial results", async () => {
  const { readSpreadsheetText } = await import("./utils/readSpreadsheetText.ts");
  assert.equal(await readSpreadsheetText(new File(["Série;Número"], "a.csv")), "Série;Número");
  // Exportação em Windows-1252: "é" é o byte 0xE9, inválido em UTF-8.
  assert.equal(await readSpreadsheetText(new File([Uint8Array.of(0x53, 0xe9, 0x72)], "b.csv")), "Sér");

  const section = await readSource("./components/FiscalConferencesSection.tsx");
  const client = await readSource("./services/fiscalConferenceService.ts");
  assert.match(fiscalSources.shell, /id: "conferences",\s*label: "Conferências"/);
  assert.match(fiscalSources.shell, /<FiscalConferencesSection canEdit=\{canEdit\} \/>/);
  assert.match(client, /api\.post\("\/fiscal\/conferences\/documents", \{/);
  // Viewer não executa; resultado parcial vira alerta, nunca "completo".
  assert.match(section, /\{canEdit \? \(\s*<form/);
  assert.match(section, /exige permissão de edição no Fiscal/);
  assert.match(section, /result\.status === "partial" \? \(\s*<p role="alert"/);
  assert.match(section, /downloadFile\(new Blob\(\[result\.csv\]/);
  // Arquivo acima do teto do gateway é barrado antes do envio.
  assert.match(section, /const MAX_FILE_BYTES = 450_000;/);
  assert.match(section, /size \?\? 0\) > MAX_FILE_BYTES/);
  assert.match(section, /catch \(error\) \{\s*toast\.error\(getFiscalErrorMessage\(error\)\);/);
});

await runTest("fiscal XML selection parses requests, encodes the ZIP and shows ambiguous items", async () => {
  const { fileToBase64, parseNoteRequests } = await import("./utils/xmlSelection.ts");
  assert.deepEqual(parseNoteRequests(" 100\r\n\n11.222.333/0001-81;1;101, 2;7 \n"), [
    "100",
    "11.222.333/0001-81;1;101",
    "2;7",
  ]);
  const bytes = Uint8Array.from({ length: 70_000 }, (_, index) => index % 256);
  assert.equal(await fileToBase64(new Blob([bytes])), Buffer.from(bytes).toString("base64"));

  const section = await readSource("./components/FiscalXmlSelectionSection.tsx");
  const client = await readSource("./services/fiscalConferenceService.ts");
  assert.match(fiscalSources.shell, /<FiscalXmlSelectionSection canEdit=\{canEdit\} \/>/);
  assert.match(client, /api\.post\("\/fiscal\/conferences\/xml-selection", \{/);
  assert.match(section, /\{canEdit \? \(\s*<form/);
  assert.match(section, /result\.status === "partial" \? \(\s*<p role="alert"/);
  // Só oferece o ZIP quando o servidor selecionou algo; o relatório sempre pode ser baixado.
  assert.match(section, /\{result\.zip_base64 \? \(/);
  assert.match(section, /Baixar relatório CSV/);
  assert.match(section, /const MAX_ZIP_BYTES = 650_000;/);
});

await runTest("fiscal SEFAZ × XML conference posts both files and separates situations", async () => {
  const section = await readSource("./components/FiscalSefazXmlSection.tsx");
  const client = await readSource("./services/fiscalConferenceService.ts");
  assert.match(fiscalSources.shell, /<FiscalSefazXmlSection canEdit=\{canEdit\} \/>/);
  assert.match(client, /api\.post\("\/fiscal\/conferences\/sefaz-xml", \{/);
  assert.match(client, /zip_base64: zipBase64/);
  assert.match(section, /\{canEdit \? \(\s*<form/);
  assert.match(section, /result\.status === "partial" \? \(\s*<p role="alert"/);
  // Chave usada visível por par; não comparável separado de ausência.
  assert.match(section, /<th className="px-4 py-2">Chave usada<\/th>/);
  assert.match(section, /"Não comparável"/);
  assert.match(section, /downloadFile\(new Blob\(\[result\.csv\]/);
  assert.match(section, /const MAX_ZIP_BYTES = 450_000;/);
  // Ordem da tabela igual à do CSV exportado: Coincidente primeiro.
  assert.match(section, /const SITUATIONS = \[\s*"Coincidente",/);
  assert.match(section, /return \[\s*\.\.\.result\.matched\.map/);
  assert.match(section, /Identidade: \{result\.identity_rule\}/);
});

await runTest("fiscal SPED × XML conference keeps items under their document", async () => {
  const section = await readSource("./components/FiscalSpedXmlSection.tsx");
  const client = await readSource("./services/fiscalConferenceService.ts");
  assert.match(fiscalSources.shell, /<FiscalSpedXmlSection canEdit=\{canEdit\} \/>/);
  assert.match(client, /api\.post\("\/fiscal\/conferences\/sped-xml", \{/);
  assert.match(section, /\{canEdit \? \(\s*<form/);
  assert.match(section, /result\.status === "partial" \? \(\s*<p role="alert"/);
  // Linha do documento seguida dos itens dele, na ordem do CSV.
  assert.match(section, /list\.flatMap\(\(pair\) => \[\s*\{ level: "Documento"/);
  assert.match(section, /\.\.\.pair\.items\.map\(\(item\) => \(\{ level: "Item"/);
  assert.match(section, /downloadFile\(new Blob\(\[result\.csv\]/);
  assert.match(section, /const MAX_SPED_BYTES = 300_000;/);
});

await runTest("fiscal IPI/ICMS ST totals show composition and excluded XML", async () => {
  const section = await readSource("./components/FiscalXmlTaxesSection.tsx");
  const client = await readSource("./services/fiscalConferenceService.ts");
  assert.match(fiscalSources.shell, /<FiscalXmlTaxesSection canEdit=\{canEdit\} \/>/);
  assert.match(client, /api\.post\("\/fiscal\/conferences\/xml-taxes", \{/);
  assert.match(section, /\{canEdit \? \(\s*<form/);
  assert.match(section, /result\.status === "partial" \? \(\s*<p role="alert"/);
  // Nota seguida dos itens que compõem o valor; excluídos visíveis, fora da soma.
  assert.match(section, /result\.notes\.flatMap\(\(note\) => \[/);
  assert.match(section, /result\.excluded\.map/);
  assert.match(section, /Não é apuração de imposto/);
  assert.match(section, /downloadFile\(new Blob\(\[result\.csv\]/);
});

await runTest("fiscal money formatting avoids floating point", async () => {
  const { formatMoney } = await import("./utils/formatMoney.ts");
  assert.equal(formatMoney("99999999999.99"), "R$ 99.999.999.999,99");
  assert.equal(formatMoney("0.30"), "R$ 0,30");
  assert.equal(formatMoney("-1234.5"), "-R$ 1.234,50");
  assert.equal(formatMoney(null), "—");
  assert.equal(formatMoney(null, "sem valor"), "sem valor");
  for (const name of ["FiscalConferencesSection", "FiscalSefazXmlSection", "FiscalSpedXmlSection", "FiscalXmlTaxesSection"]) {
    const source = await readSource(`./components/${name}.tsx`);
    assert.doesNotMatch(source, /Intl\.NumberFormat/);
    assert.match(source, /formatMoney\(value/);
  }
});

await runTest("fiscal IPI spreadsheet conference shows each source and the difference", async () => {
  const section = await readSource("./components/FiscalIpiSpreadsheetSection.tsx");
  const client = await readSource("./services/fiscalConferenceService.ts");
  assert.match(fiscalSources.shell, /<FiscalIpiSpreadsheetSection canEdit=\{canEdit\} \/>/);
  assert.match(client, /api\.post\("\/fiscal\/conferences\/ipi-spreadsheets", \{/);
  assert.match(section, /\{canEdit \? \(\s*<form/);
  assert.match(section, /result\.status === "partial" \? \(\s*<p role="alert"/);
  assert.match(section, /Diferença \(2 − 1\)/);
  assert.match(section, /formatMoney\(pair\.difference\)/);
  assert.match(section, /IPI vazio aparece como erro, não como zero/);
  assert.match(section, /result\.not_comparable\.map/);
  assert.match(section, /uma linha por nota/);
  assert.match(section, /downloadFile\(new Blob\(\[result\.csv\]/);
});

await runTest("fiscal invoice PDF totals show origin, ambiguous and unprocessed files", async () => {
  const section = await readSource("./components/FiscalInvoicePdfSection.tsx");
  const client = await readSource("./services/fiscalConferenceService.ts");
  assert.match(fiscalSources.shell, /<FiscalInvoicePdfSection canEdit=\{canEdit\} \/>/);
  assert.match(client, /api\.post\("\/fiscal\/conferences\/invoice-pdfs", \{ files: payload \}\)/);
  assert.match(section, /\{canEdit \? \(\s*<form/);
  assert.match(section, /result\.status === "partial" \? \(\s*<p role="alert"/);
  assert.match(section, /Formato suportado: \{result\.supported_format\}/);
  assert.match(section, /\{invoice\.origin\.page\}/);
  assert.match(section, /invoice\.occurrences > 1/);
  assert.match(section, /result\.not_processed\.map/);
  assert.match(section, /downloadFile\(new Blob\(\[result\.csv\]/);
});

await runTest("fiscal control reopening needs level 3 and a reason", async () => {
  const { fiscalControlStatusChange, FISCAL_CONTROL_STATUS_LABELS } = await import(
    "./utils/fiscalControl.ts"
  );
  assert.equal(fiscalControlStatusChange("PENDING", "PENDING", false), "none");
  assert.equal(fiscalControlStatusChange("PENDING", "COMPLETED", false), "direct");
  assert.equal(fiscalControlStatusChange("AWAITING_CLIENT", "IN_PROGRESS", false), "direct");
  assert.equal(fiscalControlStatusChange("COMPLETED", "IN_PROGRESS", false), "forbidden");
  assert.equal(fiscalControlStatusChange("COMPLETED", "PENDING", true), "reason");
  // Concluir com pendência (ou sem registro) na Triagem pede nível 3 e justificativa.
  assert.equal(fiscalControlStatusChange("IN_PROGRESS", "COMPLETED", false, 0), "direct");
  assert.equal(fiscalControlStatusChange("IN_PROGRESS", "COMPLETED", false, 2), "forbidden");
  assert.equal(fiscalControlStatusChange("IN_PROGRESS", "COMPLETED", true, 2), "reason");
  assert.equal(fiscalControlStatusChange("IN_PROGRESS", "COMPLETED", true, null), "reason");
  assert.equal(fiscalControlStatusChange("IN_PROGRESS", "AWAITING_CLIENT", false, 2), "direct");
  assert.equal(FISCAL_CONTROL_STATUS_LABELS.AWAITING_CLIENT, "Aguardando cliente");
});

await runTest("fiscal monthly control tab keeps viewer read-only and reasons required", async () => {
  const section = await readSource("./components/FiscalControlsSection.tsx");
  const client = await readSource("./services/fiscalControlService.ts");
  assert.match(
    fiscalSources.shell,
    /<FiscalControlsSection canEdit=\{canEdit\} canAuthorize=\{canDelete\} \/>/,
  );
  assert.match(client, /api\.get\("\/fiscal\/monthly-controls"/);
  assert.match(client, /api\.post\("\/fiscal\/monthly-controls"/);
  assert.match(client, /api\.patch\(`\/fiscal\/monthly-controls\/\$\{id\}`/);
  assert.match(section, /<div role="status">\s*<FiscalStateBox icon=\{Loader2\} tone="loading" title="Carregando controles"/);
  assert.match(section, /list\.error \? \(\s*<div role="alert">/);
  assert.match(section, /Nenhum cliente com Fiscal ativo nesta competência/);
  // Visualizador: sem formulário de abertura, sem select de situação, checkbox desabilitado.
  assert.match(section, /\{canEdit && openingForm \? \(/);
  assert.match(section, /\{canEdit \? \(\s*<select/);
  assert.match(section, /disabled=\{!canEdit \|\| item\.status === "COMPLETED" \|\| update\.isPending\}/);
  assert.match(section, /id="fiscal-control-authorization-error" role="alert"/);
  assert.match(section, /if \(reason\.length < 3\) \{\s*setAuthorizationError/);
});

await runTest("fiscal obligations: actions follow status and lock with the control", async () => {
  const { fiscalObligationActions, todayInputDate } = await import("./utils/fiscalControl.ts");
  assert.deepEqual(fiscalObligationActions("PENDING", true), ["complete", "dispense"]);
  assert.deepEqual(fiscalObligationActions("COMPLETED", true), ["undo"]);
  assert.deepEqual(fiscalObligationActions("NOT_APPLICABLE", true), ["restore"]);
  assert.deepEqual(fiscalObligationActions("PENDING", false), []);
  assert.equal(todayInputDate(new Date(2026, 0, 5)), "2026-01-05");

  const panel = await readSource("./components/FiscalControlObligationsPanel.tsx");
  const section = await readSource("./components/FiscalControlsSection.tsx");
  const client = await readSource("./services/fiscalControlService.ts");
  assert.match(client, /api\.get\(`\/fiscal\/monthly-controls\/\$\{controlId\}\/obligations`\)/);
  assert.match(client, /api\.patch\(`\/fiscal\/monthly-controls\/\$\{controlId\}\/obligations\/\$\{code\}`/);
  // Pendência só informa; a situação do controle não muda por ela.
  assert.match(section, /item\.pending_obligations/);
  assert.match(section, /locked=\{item\.status === "COMPLETED"\}/);
  assert.match(panel, /const editable = canEdit && !locked;/);
  // Dispensa sem motivo é barrada antes da API; condicional pede motivo na inclusão.
  assert.match(panel, /action\.kind === "dispense" && trimmed\.length < 3/);
  assert.match(panel, /definition\.conditional \|\| trimmed\) && trimmed\.length < 3/);
  assert.match(panel, /max=\{todayInputDate\(\)\}/);
  assert.match(panel, /queryKey: source\.portfolioKey/);
});

await runTest("fiscal control reads Triagem documents without editing them", async () => {
  const { formatTriagePending } = await import("./utils/fiscalControl.ts");
  assert.equal(formatTriagePending(null), "Sem registro");
  assert.equal(formatTriagePending(0), "Em dia");
  assert.equal(formatTriagePending(1), "1 pendente");

  const panel = await readSource("./components/FiscalControlTriagePanel.tsx");
  const section = await readSource("./components/FiscalControlsSection.tsx");
  const client = await readSource("./services/fiscalControlService.ts");
  assert.match(client, /api\.get\(`\/fiscal\/monthly-controls\/\$\{controlId\}\/triage`\)/);
  // Só leitura: nenhum PATCH/POST para a Triagem a partir do Fiscal.
  assert.doesNotMatch(panel, /useMutation|api\.(post|patch|put)/);
  assert.match(section, /control\.triage_pending,/);
  assert.match(section, /Concluir com pendência na Triagem/);
  assert.match(section, /Há documentos pendentes na Triagem: concluir exige Fiscal nível 3 e justificativa\./);
});

await runTest("fiscal responsibles: portfolio by competence or current, transfer for level 3", async () => {
  const { formatTransferResult, matchesResponsible } = await import("./utils/fiscalControl.ts");
  const item = { responsible_id: "ana", default_responsible_id: "bruno" };
  assert.equal(matchesResponsible(item, { userId: "", basis: "competence" }), true);
  assert.equal(matchesResponsible(item, { userId: "ana", basis: "competence" }), true);
  assert.equal(matchesResponsible(item, { userId: "ana", basis: "current" }), false);
  assert.equal(matchesResponsible(item, { userId: "bruno", basis: "current" }), true);
  assert.equal(
    matchesResponsible(
      { responsible_id: null, default_responsible_id: "bruno" },
      { userId: "none", basis: "competence" },
    ),
    true,
  );
  assert.equal(formatTransferResult({ transferred: ["a"], skipped: [] }), "1 transferido.");
  assert.equal(
    formatTransferResult({
      transferred: [],
      skipped: [
        { id: "b", reason: "Controle concluído." },
        { id: "c", reason: "Controle concluído." },
      ],
    }),
    "0 transferidos, 2 ignorados (Controle concluído.).",
  );

  const section = await readSource("./components/FiscalControlsSection.tsx");
  const dialog = await readSource("./components/FiscalControlTransferDialog.tsx");
  const client = await readSource("./services/fiscalControlService.ts");
  assert.match(client, /api\.post\("\/fiscal\/monthly-controls\/transfer", payload\)/);
  assert.match(client, /api\.get\("\/fiscal\/monthly-controls\/responsibles"\)/);
  // Seleção e transferência só para nível 3; concluídos não são selecionáveis.
  assert.match(section, /\{canAuthorize && selectedIds\.length \? \(/);
  assert.match(section, /disabled=\{item\.status === "COMPLETED"\} title=\{item\.status === "COMPLETED" \? "Controle concluído não é transferido\." : undefined\}/);
  assert.match(section, /Carteira atual: \{item\.default_responsible_name/);
  assert.match(dialog, /if \(reason\.trim\(\)\.length < 3\) \{/);
  assert.match(dialog, /enabled: open/);
});

await runTest("fiscal annual control shows each declaration and reuses the item rules", async () => {
  const { formatAnnualDeclaration } = await import("./utils/fiscalControl.ts");
  assert.equal(formatAnnualDeclaration(undefined), "—");
  assert.equal(formatAnnualDeclaration({ status: "PENDING", completed_on: null }), "Pendente");
  assert.equal(
    formatAnnualDeclaration({ status: "COMPLETED", completed_on: "2026-03-20" }),
    "Cumprida em 20/03/2026",
  );
  assert.equal(formatAnnualDeclaration({ status: "NOT_APPLICABLE", completed_on: null }), "Não aplicável");

  const section = await readSource("./components/FiscalAnnualControlsSection.tsx");
  const client = await readSource("./services/fiscalAnnualService.ts");
  assert.match(fiscalSources.shell, /<FiscalAnnualControlsSection canEdit=\{canEdit\} \/>/);
  assert.match(client, /api\.get\("\/fiscal\/annual-controls", \{ params: \{ year \} \}\)/);
  assert.match(client, /api\.patch\(`\/fiscal\/annual-controls\/\$\{controlId\}\/items\/\$\{code\}`/);
  // Sem situação geral: só as colunas de cada declaração, sem DIRBI.
  assert.doesNotMatch(section, /item\.status/);
  assert.doesNotMatch(client, /DIRBI/);
  assert.match(section, /<FiscalControlObligationsPanel source=\{annualItemSource\(item\.id\)\}/);
  assert.match(section, /<div role="status">\s*<FiscalStateBox icon=\{Loader2\} tone="loading" title="Carregando controles anuais"/);
});
