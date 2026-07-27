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
  buildPessoalObligationParams,
  buildPessoalPayrollPayload,
  buildPessoalPayrollUpdatePayload,
  buildPessoalUnionPayload,
  buildPessoalUnionListParams,
  hasPessoalPasswordSecretFields,
} from "./services/pessoalService.ts";
import { PESSOAL_QUERY_KEY, pessoalQueryKey } from "./hooks/queryKeys.ts";
import { formatPessoalObligationGenerationSummary } from "./utils/obligationGenerationSummary.ts";
import { getPessoalErrorMessage } from "./utils/pessoalErrorMessage.ts";

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
  assert.equal(PESSOAL_ENDPOINTS.overview, "/pessoal/overview");
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

runTest("pessoal tabs stay stable for branch integration", () => {
  assert.deepEqual(
    PESSOAL_TABS.map((tab) => tab.id),
    ["overview", "unions", "payroll", "obligations", "tracking", "passwords"],
  );
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

runTest("departamento pessoal page uses the pessoal module instead of the old mock", () => {
  const page = readFileSync("src/pages/departamento-pessoal/index.tsx", "utf8");

  assert.match(page, /@modules\/pessoal/);
  assert.doesNotMatch(page, /shared\/components\/newLayout\/DepartamentoPessoal/);
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
    group: "Grupo A",
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

runTest("obligation params map client and competence", () => {
  assert.deepEqual(buildPessoalObligationParams("client-1", "2026-07"), {
    client_id: "client-1",
    competence: "2026-07",
  });
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

runTest("pessoal shell wires access, client selector, and functional tabs", () => {
  const shell = readFileSync("src/modules/pessoal/components/PessoalShell.tsx", "utf8");
  const clientSelector = readFileSync(
    "src/modules/pessoal/components/PessoalClientSelector.tsx",
    "utf8",
  );

  assert.match(shell, /useModuleAccess\("pessoal"\)/);
  assert.match(shell, /PessoalUnionsSection canEdit=\{access\.canEdit\}/);
  assert.match(shell, /PessoalPayrollSection selectedClientId=\{selectedClientId\}/);
  assert.match(shell, /PessoalObligationsSection selectedClientId=\{selectedClientId\}/);
  assert.match(shell, /PessoalTrackingSection selectedClientId=\{selectedClientId\}/);
  assert.match(shell, /PessoalPasswordsSection[\s\S]*selectedClientId=\{selectedClientId\}/);
  assert.match(shell, /PessoalPasswordsSection\s+key=\{selectedClientId\}/);
  assert.match(shell, /PessoalOverviewSection onSelectTab=\{setActiveTab\}/);
  assert.match(clientSelector, /ClientPickerModal/);
  assert.match(clientSelector, /ref: "deps"/);
  assert.match(clientSelector, /status: "Departamento pessoal"/);
  assert.match(clientSelector, /allowClearSelection/);
  assert.doesNotMatch(clientSelector, /useClients\(/);
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
  assert.match(overview, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(280px,1fr\)\]/);
  assert.match(overview, /bg-gradient-to-br from-blue-700/);
  assert.match(overview, /min-h-\[260px\]/);
  assert.match(overview, /text-3xl font-bold/);
  assert.match(overview, /className="rounded-lg border border-gray-200 bg-white p-3/);
  assert.match(overview, /text-xs font-bold uppercase/);
  assert.match(overview, /onSelectTab\(card\.tabId\)/);
  assert.match(overview, /tabId: "payroll"/);
  assert.match(overview, /tabId: "obligations"/);
  assert.match(overview, /grid grid-cols-2 gap-3/);
  assert.match(overview, /featureCards\.slice\(2\)/);
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

console.log("pessoal contract tests passed");
