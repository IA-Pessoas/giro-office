import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PESSOAL_ENDPOINTS,
  PESSOAL_TABS,
  unwrapPessoalEnvelope,
  unwrapPessoalPage,
} from "./services/pessoalService.contract.ts";
import {
  buildPessoalLddListParams,
  buildPessoalGroupPayload,
  buildPessoalObligationParams,
  buildPessoalObligationPortfolioParams,
  buildPessoalPayrollPayload,
  buildPessoalPayrollUpdatePayload,
  buildPessoalUnionPayload,
  buildPessoalUnionListParams,
  hasPessoalPasswordSecretFields,
} from "./services/pessoalService.ts";
import {
  buildPessoalUnionFormPayload,
  buildPessoalUnionFormValues,
  formatPessoalUnionCnpjInput,
  normalizePessoalUnionCnpjValue,
  validatePessoalUnionPayload,
} from "./components/pessoalFormValueHelpers.ts";
import { PESSOAL_QUERY_KEY, pessoalQueryKey } from "./hooks/queryKeys.ts";
import { PESSOAL_GROUP_POLICY_LABELS } from "./types/groups.ts";
import { formatPessoalObligationGenerationSummary } from "./utils/obligationGenerationSummary.ts";
import {
  formatObligationHistoryValue,
  obligationItemState,
  obligationItemValue,
} from "./utils/obligationPortfolio.ts";
import {
  buildLddImportDraftRows,
  buildLddImportRows,
  editLddImportDraftRow,
  lddImportDraftRowErrors,
  lddImportDraftTotal,
  summarizeLddImportByKey,
  validateLddPdfFile,
} from "./utils/lddImportPreview.ts";
import { buildLddSheet } from "./utils/lddSheet.ts";
import {
  PESSOAL_PASSWORD_PORTALS,
  PESSOAL_PASSWORD_SERVICE_OPTIONS,
  pessoalPasswordPortalUrl,
} from "./utils/passwordPortals.ts";
import { buildPayrollSheetRows, sortSituationsForSheet } from "./utils/payrollSheet.ts";
import { getPessoalErrorMessage } from "./utils/pessoalErrorMessage.ts";
import {
  cancelUnionDeletion,
  completeUnionDeletion,
  failUnionDeletion,
  getUnionDeletionTargetId,
  openUnionDeletion,
} from "./utils/unionDeletionFlow.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("pessoal endpoints match the gateway public contract", () => {
  assert.equal(PESSOAL_ENDPOINTS.ldd, "/pessoal/ldd");
  assert.equal(PESSOAL_ENDPOINTS.lddDetail("ldd-1"), "/pessoal/ldd/ldd-1");
  assert.equal(PESSOAL_ENDPOINTS.lddImportPreview, "/pessoal/ldd/import/preview");
  assert.equal(PESSOAL_ENDPOINTS.lddImport, "/pessoal/ldd/import");
  assert.equal(PESSOAL_ENDPOINTS.overview, "/pessoal/overview");
  assert.equal(PESSOAL_ENDPOINTS.groups, "/pessoal/groups");
  assert.equal(PESSOAL_ENDPOINTS.groupDetail("group-1"), "/pessoal/groups/group-1");
  assert.equal(
    PESSOAL_ENDPOINTS.groupReactivate("group-1"),
    "/pessoal/groups/group-1/reactivate",
  );
  assert.equal(PESSOAL_ENDPOINTS.situations, "/pessoal/situations");
  assert.equal(
    PESSOAL_ENDPOINTS.situationDetail("situation-1"),
    "/pessoal/situations/situation-1",
  );
  assert.equal(PESSOAL_ENDPOINTS.unions, "/pessoal/unions");
  assert.equal(PESSOAL_ENDPOINTS.unionDetail("union-1"), "/pessoal/unions/union-1");
  assert.equal(PESSOAL_ENDPOINTS.payroll, "/pessoal/payroll");
  assert.equal(PESSOAL_ENDPOINTS.payrollDetail("client-1"), "/pessoal/payroll/client-1");
  assert.equal(PESSOAL_ENDPOINTS.obligations, "/pessoal/obrigations");
  assert.equal(
    PESSOAL_ENDPOINTS.obligationDetail("obligation-1"),
    "/pessoal/obrigations/obligation-1",
  );
  assert.equal(
    PESSOAL_ENDPOINTS.obligationGenerate("2026-07"),
    "/pessoal/obrigations/competences/2026-07/generate",
  );
  assert.equal(PESSOAL_ENDPOINTS.passwords, "/pessoal/passwords");
  assert.equal(PESSOAL_ENDPOINTS.passwordDetail("password-1"), "/pessoal/passwords/password-1");
});

runTest("pessoal situation deletion client uses the detail endpoint and refreshes cached state", () => {
  const service = readFileSync("src/modules/pessoal/services/pessoalService.ts", "utf8");
  const trackingHook = readFileSync("src/modules/pessoal/hooks/usePessoalTracking.ts", "utf8");

  assert.match(
    service,
    /async deleteSituation\(id: string\): Promise<PessoalSituation> \{[\s\S]*?api\.delete\(PESSOAL_ENDPOINTS\.situationDetail\(id\)\)/,
  );
  assert.match(
    trackingHook,
    /export function useDeletePessoalSituationMutation\(\s*clientId: string,?\s*\)[\s\S]*?mutationFn: \(id\) => pessoalService\.deleteSituation\(id\)[\s\S]*?situationsKey\(clientId\)[\s\S]*?situationDetailKey\(id\)/,
  );
});

runTest("pessoal situations expose a permissioned delete confirmation with feedback", () => {
  const section = readFileSync(
    "src/modules/pessoal/components/PessoalTrackingSection.tsx",
    "utf8",
  );

  assert.match(section, /useDeletePessoalSituationMutation\(selectedClientId\)/);
  assert.match(section, /const \[situationToDelete, setSituationToDelete\] = useState<PessoalSituation \| null>\(null\)/);
  assert.match(section, /function openDeleteSituationDialog\(situation: PessoalSituation\) \{[\s\S]*?if \(!canEdit\) \{[\s\S]*?return;/);
  assert.match(section, /async function handleConfirmDeleteSituation\(\) \{[\s\S]*?await deleteSituationMutation\.mutateAsync\(situation\.id\)/);
  assert.match(section, /setSuccessMessage\("Situação removida\."\)/);
  assert.match(section, /title="Remover situação"/);
  assert.match(section, /Não será possível recuperar a situação, mesmo quando ela já estiver finalizada\./);
  assert.match(section, /<ConfirmationDialog[\s\S]*?title="Remover situação"/);
  assert.match(section, /isConfirming=\{deleteSituationMutation\.isPending\}/);
  assert.match(section, /\{canEdit \? \([\s\S]*?onClick=\{\(\) => openDeleteSituationDialog\(situation\)\}/);
});

runTest("pessoal tabs stay stable for branch integration", () => {
  assert.deepEqual(
    PESSOAL_TABS.map((tab) => tab.id),
    [
      "overview",
      "groups",
      "groupAssignments",
      "unions",
      "payroll",
      "obligations",
      "tracking",
      "passwords",
    ],
  );
});

runTest("pessoal group assignments use the persisted preview contract", () => {
  const service = readFileSync("src/modules/pessoal/services/pessoalService.ts", "utf8");
  const section = readFileSync(
    "src/modules/pessoal/components/PessoalGroupAssignmentSection.tsx",
    "utf8",
  );

  assert.match(service, /createGroupAssignmentPreview\(\s*groupId: string,\s*clientIds: string\[\]/);
  assert.match(service, /"Idempotency-Key": idempotencyKey/);
  assert.match(section, /Prévia de atribuição em lote/);
  assert.match(section, /Aplicar prévia/);
  assert.match(section, /function clearPreview\(\)[\s\S]*createPreviewMutation\.reset\(\)/);
});

runTest("unwrapPessoalEnvelope extracts data and accepts raw fallback", () => {
  const payload = { id: "item-1" };

  assert.deepEqual(unwrapPessoalEnvelope({ success: true, data: payload }), payload);
  assert.deepEqual(unwrapPessoalEnvelope(payload), payload);
});

runTest("pessoal query keys include domain and optional params", () => {
  assert.deepEqual(PESSOAL_QUERY_KEY, ["pessoal"]);
  assert.deepEqual(pessoalQueryKey("unions"), ["pessoal", "unions"]);
  assert.deepEqual(pessoalQueryKey("payroll", "client-1"), [
    "pessoal",
    "payroll",
    "client-1",
  ]);
});

runTest("pessoal error message never shows internal service names (#1300)", () => {
  for (const internal of [
    "AUDIT_SERVICE respondeu com HTTP 401.",
    "Falha ao chamar audit-service.",
    "USER_SERVICE_INTERNAL_TOKEN ausente.",
    "AUDIT_SERVICE_URL inválida.",
    "Falha no Audit-Service.",
    "Binding HYPERDRIVE indisponível.",
  ]) {
    assert.equal(
      getPessoalErrorMessage({ response: { data: { error: internal } } }, "Fallback"),
      "Fallback",
    );
  }
  assert.equal(getPessoalErrorMessage(new Error("AUDIT_SERVICE fora"), "Fallback"), "Fallback");
  assert.equal(
    getPessoalErrorMessage(
      { response: { data: { error: "Portal self-service indisponível." } } },
      "Fallback",
    ),
    "Portal self-service indisponível.",
  );
});

runTest("pessoal write mutations refresh lists on success and on error (#1300)", () => {
  for (const file of [
    "usePessoalGroups.ts",
    "usePessoalGroupAssignments.ts",
    "usePessoalObligations.ts",
    "usePessoalPasswords.ts",
    "usePessoalPayroll.ts",
    "usePessoalTracking.ts",
    "usePessoalUnions.ts",
  ]) {
    const hook = readFileSync(new URL(`./hooks/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(hook, /onSuccess:/, `${file} ainda invalida só no sucesso`);
  }
});

runTest("pessoal union form rejects invalid CNPJ on new or changed values (#1301)", () => {
  const union = (cnpj) => ({ name: "Sindicato QA", cnpj, base_date: null });
  assert.match(validatePessoalUnionPayload(union("123")), /CNPJ inválido/);
  assert.match(validatePessoalUnionPayload(union("11222333000144")), /CNPJ inválido/);
  assert.equal(validatePessoalUnionPayload(union("11222333000181")), null);
  assert.equal(validatePessoalUnionPayload(union("12ABC34501DE35")), null);
  assert.match(validatePessoalUnionPayload({ ...union("11222333000181"), name: "" }), /nome/);
  assert.match(validatePessoalUnionPayload(union("")), /CNPJ do sindicato/);
  // Cadastro antigo com CNPJ fora do padrão continua editável se o CNPJ não mudar.
  assert.equal(validatePessoalUnionPayload(union("123"), "123"), null);
  assert.match(validatePessoalUnionPayload(union("124"), "123"), /CNPJ inválido/);
});

runTest("pessoal tabs and group policies are shown in Portuguese (#1301)", () => {
  assert.equal(PESSOAL_TABS.find((tab) => tab.id === "overview")?.label, "Visão geral");
  assert.equal(PESSOAL_GROUP_POLICY_LABELS.NORMAL, "Normal");
  assert.equal(PESSOAL_GROUP_POLICY_LABELS.NO_OBLIGATIONS, "Sem obrigações");
});

runTest("pessoal error message prefers api fields before local fallback", () => {
  assert.equal(
    getPessoalErrorMessage(
      { response: { data: { error: "Erro retornado pela API", message: "Mensagem da API" } } },
      "Fallback",
    ),
    "Erro retornado pela API",
  );
  assert.equal(
    getPessoalErrorMessage({ response: { data: { message: "Mensagem da API" } } }, "Fallback"),
    "Mensagem da API",
  );
  assert.equal(getPessoalErrorMessage(new Error("Erro local"), "Fallback"), "Erro local");
  assert.equal(
    getPessoalErrorMessage({ response: { data: { error: "   " } } }, "Fallback"),
    "Fallback",
  );
});

runTest("password form errors are rendered inside the open modal", () => {
  const source = readFileSync(
    "src/modules/pessoal/components/PessoalPasswordsSection.tsx",
    "utf8",
  );
  const dialogStart = source.indexOf('<form onSubmit={handleSubmit} className="space-y-3">');
  const alertIndex = source.indexOf('role="alert"', dialogStart);
  const serviceFieldIndex = source.indexOf("Serviço", dialogStart);

  assert.ok(dialogStart >= 0);
  assert.ok(alertIndex > dialogStart && alertIndex < serviceFieldIndex);
  assert.match(source, /formError && !isFormOpen/);
});

runTest("departamento pessoal page uses the pessoal module instead of the old mock", () => {
  const page = readFileSync("src/pages/departamento-pessoal/index.tsx", "utf8");

  assert.match(page, /@modules\/pessoal/);
  assert.doesNotMatch(page, /shared\/components\/newLayout\/DepartamentoPessoal/);
});

runTest("prioritized unclear fields expose shared contextual help", () => {
  const fieldHelp = readFileSync("src/shared/ui/newLayout/field-help.tsx", "utf8");
  const tracking = readFileSync("src/modules/pessoal/components/PessoalTrackingSection.tsx", "utf8");
  const obligations = readFileSync(
    "src/modules/pessoal/components/PessoalObligationsSection.tsx",
    "utf8",
  );
  const payroll = readFileSync("src/modules/pessoal/components/PessoalPayrollSection.tsx", "utf8");
  const certificate = readFileSync(
    "src/modules/certificates/components/CertificateForm.tsx",
    "utf8",
  );
  const regularize = readFileSync(
    "src/modules/regularize/components/RegularizeGuidanceForm.tsx",
    "utf8",
  );
  const regularizeControls = readFileSync(
    "src/modules/regularize/components/regularizeFormControls.tsx",
    "utf8",
  );

  assert.match(fieldHelp, /TooltipTrigger/);
  assert.match(fieldHelp, /aria-label/);
  assert.match(tracking, /FieldHelp/);
  assert.match(tracking, /Período/);
  assert.match(tracking, /Saldo/);
  assert.match(obligations, /FieldHelp/);
  assert.match(obligations, /assistance_fee: "Indica/);
  assert.match(obligations, /bsf: "Indica/);
  assert.match(payroll, /FieldHelp/);
  assert.match(payroll, /Tipo de adiantamento/);
  assert.match(payroll, /Onvio/);
  assert.match(payroll, /Reinf/);
  assert.match(certificate, /FieldHelp/);
  assert.match(certificate, /Natureza jurídica/);
  assert.match(certificate, /Situação Castelo/);
  assert.match(certificate, /Situação Focus/);
  assert.match(certificate, /Valor pago/);
  assert.match(regularizeControls, /FieldHelp/);
  assert.match(regularize, /Natureza jurídica/);
  assert.match(regularize, /help="Classificação jurídica da empresa conforme o cadastro oficial\."/);
});

runTest("union payload builder keeps backend field names", () => {
  assert.deepEqual(
    buildPessoalUnionPayload({
      name: "Sindicato A",
      cnpj: "12.345.678/0001-90",
      base_date: null,
    }),
    {
      name: "Sindicato A",
      cnpj: "12.345.678/0001-90",
      base_date: null,
    },
  );
});

runTest("group payload trims input and preserves its policy before sending the catalog mutation", () => {
  assert.deepEqual(buildPessoalGroupPayload({ name: "  Grupo A  ", policy: "NO_OBLIGATIONS" }), {
    name: "Grupo A",
    policy: "NO_OBLIGATIONS",
  });
});

runTest("union cnpj helper formats progressively and keeps the 14-character cap", () => {
  assert.equal(formatPessoalUnionCnpjInput("1"), "1");
  assert.equal(formatPessoalUnionCnpjInput("12"), "12");
  assert.equal(formatPessoalUnionCnpjInput("123"), "12.3");
  assert.equal(formatPessoalUnionCnpjInput("1234"), "12.34");
  assert.equal(formatPessoalUnionCnpjInput("12345"), "12.345");
  assert.equal(formatPessoalUnionCnpjInput("123456"), "12.345.6");
  assert.equal(formatPessoalUnionCnpjInput("1234567"), "12.345.67");
  assert.equal(formatPessoalUnionCnpjInput("12345678"), "12.345.678");
  assert.equal(formatPessoalUnionCnpjInput("123456789"), "12.345.678/9");
  assert.equal(formatPessoalUnionCnpjInput("123456789012"), "12.345.678/9012");
  assert.equal(formatPessoalUnionCnpjInput("1234567890123"), "12.345.678/9012-3");
  assert.equal(formatPessoalUnionCnpjInput("12345678901234"), "12.345.678/9012-34");
  assert.equal(formatPessoalUnionCnpjInput("12a3456b7890c1234"), "12.A34.56B/7890-C1");
  assert.equal(formatPessoalUnionCnpjInput("12345678901234567890"), "12.345.678/9012-34");
});

runTest("union cnpj payload normalization strips formatting before submit", () => {
  assert.equal(normalizePessoalUnionCnpjValue("12.345.678/0001-90"), "12345678000190");
  assert.equal(normalizePessoalUnionCnpjValue("12.abc.345/0001-90"), "12ABC345000190");
  assert.equal(normalizePessoalUnionCnpjValue("12a3456b7890c1d2e3"), "12A3456B7890C1");
  assert.deepEqual(
    buildPessoalUnionFormValues({
      id: "union-1",
      name: "Metal",
      cnpj: "12345678000190",
      base_date: null,
    }),
    {
      name: "Metal",
      cnpj: "12.345.678/0001-90",
      base_date: "",
    },
  );
  assert.deepEqual(
    buildPessoalUnionFormPayload({
      name: " Metal ",
      cnpj: "12.345.678/0001-90",
      base_date: "2026-08-05",
    }),
    {
      name: "Metal",
      cnpj: "12345678000190",
      base_date: "2026-08-05",
    },
  );
});

runTest("union form component keeps the extracted helper identifiers", () => {
  const section = readFileSync(
    "src/modules/pessoal/components/PessoalUnionsSection.tsx",
    "utf8",
  );

  assert.match(section, /buildPessoalUnionFormValues\(union\)/);
  assert.match(section, /buildPessoalUnionFormPayload\(formValues\)/);
  assert.match(section, /buildPessoalUnionFormValues\(savedUnion\)/);
  assert.doesNotMatch(section, /buildUnionFormValues|buildUnionFormPayload/);
});

runTest("union management sends remote search and pagination", () => {
  assert.deepEqual(
    buildPessoalUnionListParams({ search: " Metal ", page: 2, limit: 20 }),
    { search: "Metal", page: 2, limit: 20 },
  );
  const page = {
    data: [{ id: "union-21", name: "Metal", cnpj: "123", base_date: null }],
    total: 21,
    page: 2,
    limit: 20,
    hasMore: false,
  };
  assert.deepEqual(unwrapPessoalPage({ data: page }, { page: 2, limit: 20 }), page);
});

runTest("union management is paginated while payroll keeps the full catalog", () => {
  const section = readFileSync(
    "src/modules/pessoal/components/PessoalUnionsSection.tsx",
    "utf8",
  );
  const payroll = readFileSync(
    "src/modules/pessoal/components/PessoalPayrollSection.tsx",
    "utf8",
  );

  assert.match(section, /usePaginatedPessoalUnions/);
  assert.match(section, /useDebouncedValue\(searchTerm\.trim\(\), 300\)/);
  assert.match(section, /<PaginationControls/);
  assert.match(payroll, /usePessoalUnions\(\)/);
  assert.doesNotMatch(payroll, /usePaginatedPessoalUnions/);
});

runTest("union deletion uses the scoped client, cache mutation, and guarded dialog", () => {
  const service = readFileSync("src/modules/pessoal/services/pessoalService.ts", "utf8");
  const hook = readFileSync("src/modules/pessoal/hooks/usePessoalUnions.ts", "utf8");
  const section = readFileSync(
    "src/modules/pessoal/components/PessoalUnionsSection.tsx",
    "utf8",
  );

  assert.match(service, /async deleteUnion\(id: string\): Promise<PessoalUnion>/);
  assert.match(service, /api\.delete\(PESSOAL_ENDPOINTS\.unionDetail\(id\)\)/);
  assert.match(hook, /export function useDeletePessoalUnionMutation/);
  assert.match(hook, /mutationFn: \(id\) => pessoalService\.deleteUnion\(id\)/);
  assert.match(hook, /onSettled: async \(\) => \{\s*await queryClient\.invalidateQueries\(\{ queryKey: unionsKey \}\)/);
  assert.match(section, /useDeletePessoalUnionMutation/);
  assert.match(section, /canEdit \? \(\s*<td/);
  assert.match(section, /<ConfirmationDialog[\s\S]*title="Remover sindicato"/);
  assert.match(section, /openUnionDeletion/);
  assert.match(section, /getUnionDeletionTargetId\(unionDeletion\)/);
  assert.match(section, /await deleteMutation\.mutateAsync\(unionId\)/);
  assert.match(section, /completeUnionDeletion\(current, unionId\)/);
  assert.match(section, /failUnionDeletion\(current, unionId, message\)/);
  assert.match(section, /unionDeletion\.union\.name/);
  assert.match(section, /role="alert"/);
  assert.match(section, /unionDeletion\.union\.cnpj/);
  assert.match(section, /toast\.success\("Sindicato removido\."\)/);
  assert.match(
    section,
    /const message = getPessoalErrorMessage\(error, "Não foi possível remover o sindicato\."\)/,
  );
  assert.match(section, /toast\.error\(message\)/);
  assert.doesNotMatch(section, /window\.confirm|confirm\(/);
});

runTest("union deletion state preserves the chosen target and cancels without a request target", () => {
  const union = { id: "union-42", name: "Metal", cnpj: "123", base_date: null };
  const opened = openUnionDeletion(null, union, { canEdit: true, isPending: false });

  assert.equal(getUnionDeletionTargetId(opened), "union-42");
  assert.equal(opened?.union.name, "Metal");
  assert.equal(getUnionDeletionTargetId(cancelUnionDeletion(opened, false)), null);
});

runTest("union deletion result closes only after success and keeps the target with the API conflict", () => {
  const union = { id: "union-42", name: "Metal", cnpj: "123", base_date: null };
  const opened = openUnionDeletion(null, union, { canEdit: true, isPending: false });
  const conflict = failUnionDeletion(
    opened,
    "union-42",
    "Não é possível remover o sindicato porque ele está vinculado a uma configuração de folha.",
  );

  assert.equal(getUnionDeletionTargetId(conflict), "union-42");
  assert.equal(
    conflict?.error,
    "Não é possível remover o sindicato porque ele está vinculado a uma configuração de folha.",
  );
  assert.equal(getUnionDeletionTargetId(completeUnionDeletion(conflict, "union-42")), null);
});

runTest("payroll payload builder keeps backend payroll fields", () => {
  assert.equal(PESSOAL_ENDPOINTS.payrollDetail("client-1"), "/pessoal/payroll/client-1");
  const payload = {
    client_id: "client-1",
    responsible_id: null,
    advance: false,
    advance_type: null,
    advance_amount: null,
    info: "Folha mensal",
    previous: false,
    onvio: false,
    group_id: "group-1",
    vt: false,
    vt_value: null,
    vt_type: null,
    va: false,
    assistance_fee: false,
    union_id: null,
    bem_mais: false,
    bsf: false,
    reinf: false,
    employees: 0,
    contact: null,
  };

  assert.equal(buildPessoalPayrollPayload(payload).client_id, "client-1");
  assert.equal("client_id" in buildPessoalPayrollUpdatePayload(payload), false);
});

runTest("payroll and LDD forms reject negative money values before submit", () => {
  const payroll = readFileSync(
    "src/modules/pessoal/components/PessoalPayrollSection.tsx",
    "utf8",
  );
  const tracking = readFileSync(
    "src/modules/pessoal/components/PessoalTrackingSection.tsx",
    "utf8",
  );

  assert.match(payroll, /payload\.advance_amount < 0/);
  assert.match(payroll, /payload\.vt_value < 0/);
  assert.match(tracking, /payload\.balance_amount < 0/);
  assert.match(payroll, /min=\{isMoney \? undefined : 0\}/);
});

runTest("pessoal money fields use the shared BRL mask and keep numeric payloads", () => {
  const payroll = readFileSync(
    "src/modules/pessoal/components/PessoalPayrollSection.tsx",
    "utf8",
  );
  const tracking = readFileSync(
    "src/modules/pessoal/components/PessoalTrackingSection.tsx",
    "utf8",
  );
  const controls = readFileSync(
    "src/modules/pessoal/components/pessoalFormControls.ts",
    "utf8",
  );

  assert.match(payroll, /formatBrlInput/);
  assert.match(payroll, /parseBrlInput/);
  assert.match(payroll, /advance_amount: optional\(values\.advance_amount, parseBrlInput\)/);
  assert.match(payroll, /vt_value: optional\(values\.vt_value, parseBrlInput\)/);
  assert.match(payroll, /type=\{isMoney \? "text" : "number"\}/);
  // #1366: o texto digitado vai inteiro à máscara (vírgula decimal), sem virar centavos.
  assert.match(payroll, /isMoney[\s\S]*formatBrlInput\(event\.target\.value\)/);
  assert.match(payroll, /event\.key === "Backspace" \|\| event\.key === "Delete"/);
  assert.match(payroll, /pessoalNumberFieldClassName/);
  // #1301: Saldo é digitado em reais ("100" = R$ 100,00), não em centavos.
  assert.match(tracking, /onBlur=[\s\S]*formatBrlDecimalInput\(event\.currentTarget\.value\)/);
  assert.match(
    tracking,
    /balance_amount: optional\(lddFormValues\.balance_amount, parseBrlDecimalInput\)/,
  );
  assert.match(tracking, /isMoney \? "text"/);
  assert.match(controls, /pessoalNumberFieldClassName/);
});

runTest("payroll responsible field uses a user selector instead of raw IDs", () => {
  const payroll = readFileSync(
    "src/modules/pessoal/components/PessoalPayrollSection.tsx",
    "utf8",
  );

  assert.match(payroll, /useAssignableUsers/);
  assert.match(payroll, /module: "pessoal"/);
  assert.doesNotMatch(payroll, /listAdminUsers/);
  assert.doesNotMatch(payroll, /departmentService/);
  assert.match(payroll, /<select[\s\S]*value=\{formValues\.responsible_id\}/);
  assert.doesNotMatch(payroll, /label: "Responsável ID"/);
});

runTest("payroll section binds the clarified labels to rendered payroll controls", () => {
  const payroll = readFileSync(
    "src/modules/pessoal/components/PessoalPayrollSection.tsx",
    "utf8",
  );
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const [name, label] of [
    ["info", "Informações da folha"],
    ["advance_type", "Tipo de adiantamento"],
    ["vt_type", "Tipo de vale-transporte"],
    ["contact", "Contato da folha"],
    ["employees", "Quantidade de funcionários"],
    ["advance_amount", "Valor do adiantamento"],
    ["vt_value", "Valor do vale-transporte"],
    ["advance", "Adiantamento salarial"],
    ["previous", "Usar folha anterior"],
    ["onvio", "Integração com Onvio"],
    ["vt", "Vale-transporte"],
    ["va", "Vale-alimentação"],
    ["assistance_fee", "Contribuição assistencial"],
    ["bem_mais", "Bem Mais"],
    ["bsf", "BSF"],
    ["reinf", "Reinf"],
  ]) {
    assert.match(
      payroll,
      new RegExp(`name: "${name}"[\\s\\S]*?label: "${escapeRegex(label)}"`),
    );
  }

  assert.match(
    payroll,
    /\{textFields\.map\(\(field\) => \{[\s\S]*?htmlFor=\{`payroll-\$\{field\.name\}`\}[\s\S]*?<input[\s\S]*?id=\{`payroll-\$\{field\.name\}`\}/,
  );
  assert.match(payroll, /htmlFor="payroll-group_id"/);
  assert.match(payroll, /usePessoalGroups/);
  assert.doesNotMatch(payroll, /legacy_group|Grupo legado:/);
  assert.match(
    payroll,
    /\{numberFields\.map\(\(field\) => \([\s\S]*?htmlFor=\{`payroll-\$\{field\.name\}`\}[\s\S]*?<input[\s\S]*?id=\{`payroll-\$\{field\.name\}`\}/,
  );
  assert.match(
    payroll,
    /<label[\s\S]*?htmlFor="payroll-responsible_id"[\s\S]*?Responsável pela folha[\s\S]*?<select[\s\S]*?id="payroll-responsible_id"/,
  );
  assert.match(
    payroll,
    /<label[\s\S]*?htmlFor="payroll-union_id"[\s\S]*?Sindicato[\s\S]*?<select[\s\S]*?id="payroll-union_id"/,
  );
  assert.match(
    payroll,
    /\{checkboxFields\.map\(\(field\) => \{[\s\S]*?<label[\s\S]*?htmlFor=\{`payroll-\$\{field\.name\}`\}[\s\S]*?<input[\s\S]*?id=\{`payroll-\$\{field\.name\}`\}/,
  );

  assert.match(payroll, /Responsável pela folha/);
  assert.match(payroll, /Sindicato/);
  assert.doesNotMatch(payroll, /Tipo de VT/);
  assert.doesNotMatch(payroll, /Valor do VT/);
});

runTest("obligation params map client and competence", () => {
  assert.deepEqual(buildPessoalObligationParams("client-1", "2026-07"), {
    client_id: "client-1",
    competence: "2026-07",
  });
});

runTest("obligations responsible field uses a pessoal user selector instead of raw IDs", () => {
  const obligations = readFileSync(
    "src/modules/pessoal/components/PessoalObligationsSection.tsx",
    "utf8",
  );

  assert.match(obligations, /useAssignableUsers/);
  assert.match(obligations, /module: "pessoal"/);
  assert.doesNotMatch(obligations, /listAdminUsers/);
  assert.doesNotMatch(obligations, /departmentService/);
  assert.match(obligations, /<select[\s\S]*value=\{responsibleId\}/);
  assert.match(obligations, /responsibleUsersQuery\.isError/);
  assert.match(obligations, /Respons.veis indispon.veis/);
  assert.match(obligations, /<option value=\{responsibleId\}>Respons.vel atual<\/option>/);
  assert.doesNotMatch(obligations, /Respons.vel ID/);
});

runTest("password responsible field uses the contextual pessoal user selector", () => {
  const passwords = readFileSync(
    "src/modules/pessoal/components/PessoalPasswordsSection.tsx",
    "utf8",
  );

  assert.match(passwords, /useAssignableUsers/);
  assert.match(passwords, /module: "pessoal"/);
  assert.doesNotMatch(passwords, /listAdminUsers/);
  assert.match(passwords, /<select[\s\S]*value=\{formValues\.responsavel_id\}/);
  assert.match(passwords, /Respons.vel atual/);
});

runTest("obligation generation copy explains global scope and no-payroll count", () => {
  const section = readFileSync(
    "src/modules/pessoal/components/PessoalObligationsSection.tsx",
    "utf8",
  );
  const message = formatPessoalObligationGenerationSummary({
    clients: 10,
    payrollRows: 8,
    existing: 3,
    created: 5,
    skippedExisting: 3,
    skippedNoPayroll: 2,
  });

  assert.match(section, /Gerar todos/);
  assert.match(section, /A gera[cç][aã]o em massa avalia todos os clientes ativos de Departamento Pessoal/);
  assert.match(section, /<PessoalPlaceholderSection/);
  assert.doesNotMatch(section, /if \(!hasClient\) \{\s*return/);
  assert.equal(
    message,
    "Geração global concluída: 10 clientes avaliados, 8 clientes com folha configurada, 5 criadas, 3 existentes, 2 clientes sem configuração de folha.",
  );
  assert.doesNotMatch(section, /\$\{result\.skippedNoPayroll\} sem folha/);
});

runTest("ldd list params include optional client id only when present", () => {
  assert.deepEqual(buildPessoalLddListParams("client-1"), { client_id: "client-1" });
  assert.deepEqual(buildPessoalLddListParams(""), {});
});

runTest("password list items are treated as non-secret summaries", () => {
  assert.equal(
    hasPessoalPasswordSecretFields({ id: "p1", service_name: "Gov", client_id: "c1" }),
    false,
  );
  assert.equal(
    hasPessoalPasswordSecretFields({
      id: "p1",
      service_name: "Gov",
      client_id: "c1",
      senha_main: "secret",
    }),
    true,
  );
});

runTest("pessoal shell wires access, active client selector, and functional tabs", () => {
  const shell = readFileSync("src/modules/pessoal/components/PessoalShell.tsx", "utf8");
  const clientSelector = readFileSync(
    "src/modules/pessoal/components/PessoalClientSelector.tsx",
    "utf8",
  );

  assert.match(shell, /useModuleAccess\("pessoal"\)/);
  assert.match(shell, /PessoalUnionsSection canEdit=\{access\.canEdit\}/);
  assert.match(shell, /PessoalGroupsSection canEdit=\{access\.canEdit\}/);
  assert.match(shell, /PessoalPayrollSection\s+selectedClientId=\{selectedClientId\}/);
  assert.match(shell, /PessoalObligationsSection selectedClientId=\{selectedClientId\}/);
  assert.match(shell, /PessoalTrackingSection\s+selectedClientId=\{selectedClientId\}/);
  assert.match(shell, /PessoalPasswordsSection[\s\S]*selectedClientId=\{selectedClientId\}/);
  assert.match(shell, /PessoalPasswordsSection\s+key=\{selectedClientId\}/);
  assert.match(shell, /PessoalOverviewSection onSelectTab=\{setActiveTab\}/);
  assert.match(clientSelector, /ClientPickerModal/);
  assert.match(clientSelector, /status: "Ativo"/);
  assert.match(clientSelector, /legacyIntegrationStatusFilter: false/);
  assert.doesNotMatch(clientSelector, /ref: "deps"/);
  assert.doesNotMatch(clientSelector, /Departamento pessoal/);
  assert.match(clientSelector, /allowClearSelection/);
  assert.doesNotMatch(clientSelector, /useClients\(/);
});

runTest("group catalog supports create, edit, archive and reactivation without a destructive delete", () => {
  const groups = readFileSync("src/modules/pessoal/components/PessoalGroupsSection.tsx", "utf8");
  const groupTypes = readFileSync("src/modules/pessoal/types/groups.ts", "utf8");

  assert.match(groups, /useCreatePessoalGroupMutation/);
  assert.match(groups, /useUpdatePessoalGroupMutation/);
  assert.match(groups, /useArchivePessoalGroupMutation/);
  assert.match(groups, /useReactivatePessoalGroupMutation/);
  assert.match(groups, /Novo grupo/);
  assert.match(groups, /Política de obrigações/);
  assert.match(groups, /PESSOAL_GROUP_POLICIES/);
  assert.match(groupTypes, /NO_OBLIGATIONS/);
  assert.match(groups, /Arquivar/);
  assert.match(groups, /Reativar/);
  assert.doesNotMatch(groups, /Trash2|Remover grupo/);
});

runTest("client-scoped sections block requests without selected client", () => {
  for (const file of [
    "PessoalPayrollSection.tsx",
    "PessoalTrackingSection.tsx",
    "PessoalPasswordsSection.tsx",
  ]) {
    const source = readFileSync(`src/modules/pessoal/components/${file}`, "utf8");

    assert.match(source, /if \(!hasClient\)/);
    assert.match(source, /PessoalPlaceholderSection/);
  }

  const obligations = readFileSync(
    "src/modules/pessoal/components/PessoalObligationsSection.tsx",
    "utf8",
  );

  assert.match(obligations, /Gerar todos/);
  assert.match(obligations, /hasClient && obligationQuery\.isLoading/);
  assert.match(obligations, /title="Obrigação individual"/);
  assert.doesNotMatch(obligations, /if \(!hasClient\) \{\s*return/);
});

runTest("situation detail exposes explicit completion and reopening actions", () => {
  const tracking = readFileSync(
    "src/modules/pessoal/components/PessoalTrackingSection.tsx",
    "utf8",
  );

  assert.match(tracking, /Concluir situação/);
  assert.match(tracking, /Reabrir situação/);
  assert.match(tracking, /handleSituationStatusChange\("Finalizado"\)/);
  assert.match(tracking, /handleSituationStatusChange\("Em andamento"\)/);
  assert.match(
    tracking,
    /if \(selectedSituationId\) \{[\s\S]*?payload: \{\s*title: payload\.title,\s*description: payload\.description,\s*\},/,
  );
  assert.doesNotMatch(tracking, /situationFormValues\.status/);
  assert.match(
    tracking,
    /handleSituationStatusChange\(nextStatus: PessoalSituationStatus\)[\s\S]*?payload: \{\s*status: nextStatus,\s*\},[\s\S]*?setSuccessMessage\(\n?\s*nextStatus === "Finalizado"\n?\s*\? "Situação concluída\."\n?\s*:\s*"Situação reaberta\."/,
  );
  assert.match(tracking, /Finalizar registra a data de conclusão\./);
  assert.match(tracking, /Reabrir limpa a data de conclusão\./);
  assert.match(tracking, /Concluída em \{formatDate\(situation\.completion_date\)\}/);
});

runTest("pessoal overview reads available dashboard data", () => {
  const overview = readFileSync("src/modules/pessoal/components/PessoalOverviewSection.tsx", "utf8");
  const trackingHook = readFileSync("src/modules/pessoal/hooks/usePessoalTracking.ts", "utf8");
  const overviewHook = readFileSync("src/modules/pessoal/hooks/usePessoalOverview.ts", "utf8");
  const service = readFileSync("src/modules/pessoal/services/pessoalService.ts", "utf8");

  assert.match(overview, /usePessoalOverview\(\)/);
  assert.doesNotMatch(overview, /usePessoalUnions\(\)/);
  assert.doesNotMatch(overview, /usePessoalLdd\("", true\)/);
  assert.match(overviewHook, /pessoalService\.getOverview\(\)/);
  assert.match(service, /getOverview\(\)/);
  assert.match(service, /PESSOAL_ENDPOINTS\.overview/);
  assert.doesNotMatch(overview, /bg-gradient-to-br/);
  // #1301: o resumo não ocupa meia tela e Folha/Obrigações mostram números.
  assert.doesNotMatch(overview, /min-h-\[260px\]|text-3xl font-bold/);
  assert.match(overview, /className="rounded-lg border border-gray-200 bg-white p-3/);
  assert.match(overview, /text-xs font-bold uppercase/);
  assert.match(overview, /onSelectTab\(card\.tabId\)/);
  assert.match(overview, /value: formatCount\(summary\?\.payroll\?\.total/);
  assert.match(overview, /value: formatCount\(summary\?\.obligations\?\.total/);
  assert.match(overview, /tabId: "payroll"/);
  assert.match(overview, /tabId: "obligations"/);
  assert.match(overview, /featureCards\.map\(renderCard\)/);
  assert.doesNotMatch(overview, /const splitCards|divide-y|divide-x/);
  assert.doesNotMatch(overview, /details:\s*\[\]/);
  assert.doesNotMatch(overview, /value: "Por cliente"|value: "Mensal"/);
  assert.match(
    trackingHook,
    /export function usePessoalLdd[\s\S]*?pessoalService\.listLdd\(clientId\)[\s\S]*?enabled,/,
  );
  assert.match(trackingHook, /lddKey\(""\)/);
});

runTest("password UI keeps secrets behind detail and explicit reveal", () => {
  const passwords = readFileSync(
    "src/modules/pessoal/components/PessoalPasswordsSection.tsx",
    "utf8",
  );

  assert.match(passwords, /revealedFields/);
  assert.match(passwords, /toggleSecretField/);
  assert.match(passwords, /getSecretText\(detail/);
  assert.match(passwords, /type="password"/);
  assert.doesNotMatch(passwords, /password\.senha_main|password\.senha_secondary/);
});

runTest("obligation portfolio sends only server-side filters and maps item states", () => {
  assert.equal(PESSOAL_ENDPOINTS.obligationPortfolio, "/pessoal/obrigations/portfolio");
  assert.deepEqual(
    buildPessoalObligationPortfolioParams({ competence: "2026-09", page: 1, pageSize: 25 }),
    { competence: "2026-09", page: 1, pageSize: 25 },
  );
  assert.deepEqual(
    buildPessoalObligationPortfolioParams({
      competence: "2026-09",
      responsavel_id: "user-1",
      group_id: "group-1",
      item: "va",
      state: "none",
      page: 2,
      pageSize: 25,
    }),
    {
      competence: "2026-09",
      responsavel_id: "user-1",
      group_id: "group-1",
      item: "va",
      state: "none",
      page: 2,
      pageSize: 25,
    },
  );
  assert.equal(
    buildPessoalObligationPortfolioParams({
      competence: "2026-09",
      state: "done",
      page: 1,
      pageSize: 25,
    }).state,
    undefined,
  );
  assert.equal(
    buildPessoalObligationPortfolioParams({
      competence: "2026-09",
      state: "pending",
      page: 1,
      pageSize: 25,
    }).state,
    "pending",
  );
  for (const value of [false, true, null]) {
    assert.equal(obligationItemValue(obligationItemState(value)), value);
  }
  assert.equal(obligationItemState(null), "none");
});

runTest("portfolio edits share the individual obligation PATCH and invalidate both views", () => {
  const hooks = readFileSync("src/modules/pessoal/hooks/usePessoalObligations.ts", "utf8");

  assert.match(
    hooks,
    /useUpdatePessoalPortfolioObligationMutation[\s\S]*?pessoalService\.updateObligationField\(id, payload\)[\s\S]*?pessoalQueryKey\("obligations"\)/,
  );
  assert.match(hooks, /pessoalQueryKey\("obligations", "portfolio",/);
});

runTest("obligation history formats item states and responsible names", () => {
  assert.equal(
    PESSOAL_ENDPOINTS.obligationHistory("ob-1"),
    "/pessoal/obrigations/ob-1/history",
  );
  const names = new Map([["user-1", "Ana"]]);
  assert.equal(formatObligationHistoryValue("va", false, names), "Pendente");
  assert.equal(formatObligationHistoryValue("va", true, names), "Concluído");
  assert.equal(formatObligationHistoryValue("va", null, names), "Não possui");
  assert.equal(formatObligationHistoryValue("responsavel_id", "user-1", names), "Ana");
  assert.equal(formatObligationHistoryValue("responsavel_id", null, names), "Sem responsável");
});

runTest("ficha edits refresh ficha, portfolio and history under one prefix", () => {
  const hooks = readFileSync("src/modules/pessoal/hooks/usePessoalObligations.ts", "utf8");

  assert.match(
    hooks,
    /useUpdatePessoalObligationMutation\([\s\S]*?invalidateQueries\(\{ queryKey: pessoalQueryKey\("obligations"\) \}\)/,
  );
  assert.match(hooks, /pessoalQueryKey\("obligations", "history"/);
});

runTest("LDD import preview keeps read errors until the row is edited", () => {
  const rows = buildLddImportDraftRows({
    file_name: "ldd.pdf",
    file_hash: "a".repeat(64),
    already_imported_at: null,
    rows: [
      {
        line: 1,
        source: "CP-SEGUR. 01/2024 20/02/2024 1.500,00 1.234,56",
        period: "01/2024",
        due_date: "2024-02-20",
        balance_amount: 1234.56,
        errors: [],
      },
      {
        line: 2,
        source: "CP-SEGUR. 13/2023 20/12/2023",
        period: "13/2023",
        due_date: "2023-12-20",
        balance_amount: null,
        errors: ["Valor não identificado na linha."],
      },
    ],
  });

  assert.deepEqual(rows[0], {
    line: 1,
    source: "CP-SEGUR. 01/2024 20/02/2024 1.500,00 1.234,56",
    period: "01/2024",
    due_date: "2024-02-20",
    balance_amount: "R$ 1.234,56",
    errors: [],
  });
  assert.deepEqual(rows[1].errors, ["Valor não identificado na linha."]);
  assert.equal(lddImportDraftTotal(rows), 1234.56);

  const fixed = editLddImportDraftRow(rows[1], "balance_amount", "0,10");
  assert.deepEqual(fixed.errors, []);
  assert.equal(
    lddImportDraftTotal([rows[0], fixed, editLddImportDraftRow(fixed, "balance_amount", "0,20")]),
    1234.86,
  );
  assert.deepEqual(editLddImportDraftRow(fixed, "balance_amount", "0,00").errors, [
    "Informe um valor maior que zero.",
  ]);
  assert.deepEqual(
    lddImportDraftRowErrors({ period: "14/2023", due_date: "2023-02-31", balance_amount: "" }),
    [
      "Informe a competência no formato MM/AAAA.",
      "Informe um vencimento válido.",
      "Informe um valor maior que zero.",
    ],
  );
});

runTest("LDD import shows existing balance and increase per key and sends only valid rows", () => {
  const draft = (line, period, due_date, balance_amount, errors = []) => ({
    line,
    source: "",
    period,
    due_date,
    balance_amount,
    errors,
  });
  const rows = [
    draft(1, "01/2024", "2024-02-20", "0,10"),
    draft(2, "01/2024", "2024-02-20", "0,20"),
    draft(3, "02/2024", "2024-03-20", "5,00"),
    draft(4, "03/2024", "", "9,00", ["Informe um vencimento válido."]),
  ];
  const existing = [
    { id: "b", type: "INSS", period: "01/2024", due_date: "2024-02-20T00:00:00.000Z", balance_amount: 7 },
    { id: "a", type: "INSS", period: "01/2024", due_date: "2024-02-20T00:00:00.000Z", balance_amount: 100.1 },
    { id: "c", type: "FGTS", period: "02/2024", due_date: "2024-03-20T00:00:00.000Z", balance_amount: 50 },
  ];

  assert.deepEqual(buildLddImportRows(rows), [
    { period: "01/2024", due_date: "2024-02-20", balance_amount: 0.1 },
    { period: "01/2024", due_date: "2024-02-20", balance_amount: 0.2 },
    { period: "02/2024", due_date: "2024-03-20", balance_amount: 5 },
  ]);
  assert.deepEqual(summarizeLddImportByKey(rows, existing), [
    { period: "01/2024", due_date: "2024-02-20", existing: 100.1, increase: 0.3, total: 100.4 },
    { period: "02/2024", due_date: "2024-03-20", existing: 0, increase: 5, total: 5 },
  ]);
});

runTest("LDD import refuses non-PDF, empty and oversized files before upload", () => {
  const pdf = { name: "ldd.PDF", type: "", size: 10 };
  assert.equal(validateLddPdfFile(pdf), null);
  assert.equal(validateLddPdfFile({ ...pdf, name: "ldd.xlsx" }), "Selecione um arquivo PDF.");
  assert.equal(validateLddPdfFile({ ...pdf, size: 0 }), "O arquivo está vazio.");
  assert.equal(
    validateLddPdfFile({ ...pdf, size: 700 * 1024 + 1 }),
    "O PDF excede o limite de 700 KB.",
  );
});

runTest("LDD sheet separates previdenciário and PGFN with subtotals and total", () => {
  const ldd = (id, type, due_date, balance_amount, extra = {}) => ({
    id,
    client_id: "client-1",
    type,
    period: null,
    due_date,
    balance_amount,
    registration_status: null,
    status: null,
    ...extra,
  });
  const sheet = buildLddSheet([
    ldd("1", "INSS", "2024-02-20T00:00:00.000Z", 0.1, { period: "01/2024" }),
    // Registro migrado do legado: tipo 1 é previdenciário, tipo 0 é PGFN.
    ldd("2", "1", "2024-03-20T00:00:00.000Z", 0.2, { period: "02/2024" }),
    ldd("3", "INSS", null, null, { period: "03/2024" }),
    ldd("4", "PGFN", null, 50, { registration_status: "12.3.45.678901-23", status: "Ativa" }),
    ldd("5", "0", null, 25.5),
    ldd("6", "FGTS", "2024-01-07T00:00:00.000Z", 10),
  ]);

  // Vencimento mais recente primeiro, como na ficha antiga; sem vencimento vai para o fim.
  assert.deepEqual(
    sheet.previdenciario.rows.map((row) => row.id),
    ["2", "1", "3"],
  );
  assert.equal(sheet.previdenciario.subtotal, 0.3);
  assert.deepEqual(
    sheet.pgfn.rows.map((row) => row.id),
    ["4", "5"],
  );
  assert.equal(sheet.pgfn.subtotal, 75.5);
  // FGTS, IRRF e ISS não entram na ficha nem no total, como na ficha antiga.
  assert.equal(sheet.excluded, 1);
  assert.equal(sheet.total, 75.8);

  const empty = buildLddSheet([]);
  assert.deepEqual(
    [empty.previdenciario.rows, empty.pgfn.rows, empty.excluded, empty.total],
    [[], [], 0, 0],
  );
});

runTest("LDD sheet prints without a competence filter and the manual form offers PGFN", () => {
  const sheet = readFileSync(new URL("./components/PessoalLddSheet.tsx", import.meta.url), "utf8");
  const tracking = readFileSync(
    new URL("./components/PessoalTrackingSection.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(new URL("../../styles/global.css", import.meta.url), "utf8");

  const shell = readFileSync(new URL("./components/PessoalPrintSheet.tsx", import.meta.url), "utf8");
  assert.match(shell, /className="print-report/);
  assert.match(shell, /printReport\(id\)/);
  assert.match(sheet, /id="pessoal-ldd-sheet"/);
  assert.doesNotMatch(sheet, /Competência/);
  assert.match(tracking, /lddTypeOptions = \["INSS", "PGFN", "FGTS", "IRRF", "ISS"\]/);
  assert.match(styles, /\.print-report \*/);
  // PGFN manual: inscrição e situação são texto livre, como na ficha.
  assert.match(tracking, /isPgfnDetail \? \(field\.name === "registration_status" \? "Inscrição" : "Situação"\)/);
});

runTest("password vault offers Empregador Web and portal shortcuts carry no credentials", () => {
  assert.ok(PESSOAL_PASSWORD_SERVICE_OPTIONS.includes("Empregador Web"));
  assert.equal(
    pessoalPasswordPortalUrl("Empregador Web"),
    "https://sd.mte.gov.br/sdweb/empregadorweb/index.jsf",
  );
  // Nome personalizado segue permitido e não ganha atalho.
  assert.equal(pessoalPasswordPortalUrl("Portal do sindicato"), null);
  assert.equal(pessoalPasswordPortalUrl("Onvio"), null);
  // Caixa, acento, espaço e os nomes da tela antiga levam ao mesmo portal.
  assert.equal(pessoalPasswordPortalUrl("  empregador web "), PESSOAL_PASSWORD_PORTALS["Empregador Web"]);
  assert.equal(pessoalPasswordPortalUrl("eSocial"), PESSOAL_PASSWORD_PORTALS["Portal eSocial"]);
  assert.equal(pessoalPasswordPortalUrl("Bem+(Mais)"), PESSOAL_PASSWORD_PORTALS["Bem Mais"]);
  assert.equal(pessoalPasswordPortalUrl("Benefício Social Familiar"), PESSOAL_PASSWORD_PORTALS.BSF);
  assert.equal(pessoalPasswordPortalUrl("Códigos de Acesso Gov"), PESSOAL_PASSWORD_PORTALS["Gov.br"]);

  for (const [service, url] of Object.entries(PESSOAL_PASSWORD_PORTALS)) {
    const parsed = new URL(url);
    assert.equal(parsed.protocol, "https:", service);
    assert.deepEqual([parsed.username, parsed.password, parsed.search, parsed.hash], ["", "", "", ""]);
    assert.ok(PESSOAL_PASSWORD_SERVICE_OPTIONS.includes(service), service);
  }

  const section = readFileSync(
    new URL("./components/PessoalPasswordsSection.tsx", import.meta.url),
    "utf8",
  );
  // O atalho é o endereço fixo do catálogo: nada do acesso (login, senha) entra no href.
  // O atalho sai do nome que já vem na lista: ver o link não abre o detalhe (leitura auditada).
  assert.match(section, /const portalUrl = pessoalPasswordPortalUrl\(password\.service_name\);/);
  assert.doesNotMatch(section, /pessoalPasswordPortalUrl\(detail/);
  assert.match(section, /href=\{portalUrl\}\s+target="_blank"\s+rel="noopener noreferrer"/);
  assert.doesNotMatch(section, /href=\{[^}]*(login_|senha_)/);
});

runTest("payroll sheet lists the legacy fields and keeps empty ones readable", () => {
  const payroll = {
    id: "payroll-1",
    client_id: "client-1",
    responsible_id: null,
    advance: true,
    advance_type: "Percentual",
    advance_amount: 40,
    info: "",
    previous: false,
    onvio: true,
    group_id: "group-1",
    group: { id: "group-1", name: "Mensal", archived_at: null },
    vt: true,
    vt_value: 220.5,
    vt_type: null,
    va: false,
    assistance_fee: true,
    union_id: "union-1",
    bem_mais: false,
    bsf: true,
    reinf: false,
    employees: 12,
    contact: null,
  };

  assert.deepEqual(buildPayrollSheetRows(payroll, [{ id: "union-1", name: "Sindicato A" }]), [
    ["Grupo", "Mensal"],
    ["Adiantamento", "Sim - Percentual - 40,00"],
    ["Prévia", "Não"],
    ["Onvio", "Sim"],
    ["Vale transporte", "Sim - 220,50"],
    ["Vale alimentação", "Não"],
    ["Taxa assistencial", "Sim"],
    ["Bem Mais", "Não"],
    ["BSF", "Sim"],
    ["Quantidade de funcionários", "12"],
    ["REINF", "Não"],
    ["Sindicato", "Sindicato A"],
    ["Contato", "Não informado"],
  ]);

  const bare = buildPayrollSheetRows(
    { ...payroll, group: null, advance: false, vt: false, union_id: null },
    [],
  );
  assert.deepEqual(
    [bare[0], bare[1], bare[4], bare[11]],
    [
      ["Grupo", "Não informado"],
      ["Adiantamento", "Não"],
      ["Vale transporte", "Não"],
      ["Sindicato", "Não informado"],
    ],
  );
  // Sindicato fora da lista carregada não vira "undefined".
  assert.deepEqual(buildPayrollSheetRows(payroll, [])[11], ["Sindicato", "Não informado"]);
});

runTest("payroll sheet orders situations by registration date and prints through the shared helper", () => {
  const situation = (id, registration_date) => ({ id, registration_date });
  assert.deepEqual(
    sortSituationsForSheet([
      situation("b", "2026-03-02T10:00:00.000Z"),
      situation("a", "2026-01-15T10:00:00.000Z"),
    ]).map((item) => item.id),
    ["a", "b"],
  );

  const sheet = readFileSync(
    new URL("./components/PessoalPayrollSheet.tsx", import.meta.url),
    "utf8",
  );
  assert.match(sheet, /<PessoalPrintSheet/);
  assert.match(sheet, /id="pessoal-payroll-sheet"/);
  assert.match(sheet, /usePessoalSituations\(clientId, open\)/);
});

console.log("pessoal contract tests passed");
