import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PESSOAL_ENDPOINTS,
  PESSOAL_TABS,
  unwrapPessoalEnvelope,
} from "./services/pessoalService.contract.ts";
import {
  buildPessoalObligationParams,
  buildPessoalLddListParams,
  buildPessoalPayrollPayload,
  buildPessoalPayrollUpdatePayload,
  buildPessoalUnionPayload,
  hasPessoalPasswordSecretFields,
} from "./services/pessoalService.ts";
import { PESSOAL_QUERY_KEY, pessoalQueryKey } from "./hooks/queryKeys.ts";

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
  assert.equal(PESSOAL_TABS.find((tab) => tab.id === "obligations")?.label, "Obrigações");
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

runTest("pessoal UI follows tecnologia-style system accent and centered tabs", () => {
  const shell = readFileSync("src/modules/pessoal/components/PessoalShell.tsx", "utf8");
  const overview = readFileSync("src/modules/pessoal/components/PessoalOverviewSection.tsx", "utf8");
  const placeholder = readFileSync(
    "src/modules/pessoal/components/PessoalPlaceholderSection.tsx",
    "utf8",
  );
  const controls = readFileSync("src/modules/pessoal/components/pessoalFormControls.ts", "utf8");
  const formValueHelpers = readFileSync(
    "src/modules/pessoal/components/pessoalFormValueHelpers.ts",
    "utf8",
  );
  const unions = readFileSync("src/modules/pessoal/components/PessoalUnionsSection.tsx", "utf8");
  const payroll = readFileSync("src/modules/pessoal/components/PessoalPayrollSection.tsx", "utf8");
  const obligations = readFileSync(
    "src/modules/pessoal/components/PessoalObligationsSection.tsx",
    "utf8",
  );
  const tracking = readFileSync(
    "src/modules/pessoal/components/PessoalTrackingSection.tsx",
    "utf8",
  );
  const passwords = readFileSync(
    "src/modules/pessoal/components/PessoalPasswordsSection.tsx",
    "utf8",
  );
  const clientSelector = readFileSync(
    "src/modules/pessoal/components/PessoalClientSelector.tsx",
    "utf8",
  );
  const source = [
    shell,
    overview,
    placeholder,
    controls,
    unions,
    payroll,
    obligations,
    tracking,
    passwords,
    clientSelector,
  ].join("\n");

  assert.match(shell, /justify-center/);
  assert.match(shell, /dark:bg-gray-800/);
  assert.doesNotMatch(shell, /useClients/);
  assert.doesNotMatch(shell, /clientQuery\.data\?\.items/);
  assert.doesNotMatch(shell, /unionCreateRequestId/);
  assert.doesNotMatch(shell, /openCreateRequestId/);
  assert.doesNotMatch(shell, /PessoalOverviewSection hasClient/);
  assert.doesNotMatch(shell, /clients=\{\[\]\}/);
  assert.match(overview, /usePessoalUnions/);
  assert.doesNotMatch(overview, /onCreateUnion|canCreateUnion|Criar sindicato/);
  assert.match(overview, /Resumo operacional/);
  assert.match(overview, /from-blue-700 via-sky-700 to-blue-800/);
  assert.match(overview, /featureCards/);
  assert.match(overview, /Folha/);
  assert.match(overview, /Obrigações/);
  assert.match(overview, /Acompanhamentos/);
  assert.doesNotMatch(overview, /label: "Senhas"/);
  assert.match(overview, /com data-base/);
  assert.match(overview, /sem data-base/);
  assert.match(overview, /CNPJs cadastrados/);
  assert.match(overview, /Boolean\(union\.cnpj\)/);
  assert.match(overview, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(280px,1fr\)\]/);
  assert.doesNotMatch(overview, /Operacao atual/);
  assert.doesNotMatch(overview, /Sindicatos cadastrados/);
  assert.doesNotMatch(overview, /overviewCards/);
  assert.doesNotMatch(overview, /Disponivel|Por cliente|Restrito|hasClient|Cliente selecionado/);
  assert.match(clientSelector, /aria-haspopup="dialog"/);
  assert.match(clientSelector, /role="dialog"/);
  assert.match(clientSelector, /useClients/);
  assert.match(clientSelector, /useDeferredValue/);
  assert.match(clientSelector, /CLIENT_PICKER_LIMIT = 50/);
  assert.match(clientSelector, /type="number"/);
  assert.match(clientSelector, /sm:w-auto/);
  assert.match(clientSelector, /min-w-44/);
  assert.match(clientSelector, /sm:max-w-80/);
  assert.match(clientSelector, /justify-center/);
  assert.match(clientSelector, /py-2\.5/);
  assert.match(clientSelector, /text-center/);
  assert.match(clientSelector, /h-8 w-14/);
  assert.match(clientSelector, /bg-blue-600/);
  assert.match(clientSelector, /setPage\(\(current\) => current \+ 1\)/);
  assert.match(clientSelector, /Selecionar cliente/);
  assert.match(clientSelector, /Sem cliente selecionado/);
  assert.match(clientSelector, /handleSelect\(null\)/);
  assert.match(clientSelector, /Nenhum cliente disponível/);
  assert.doesNotMatch(clientSelector, /Todos os clientes/);
  assert.doesNotMatch(clientSelector, /ChevronDown/);
  assert.doesNotMatch(clientSelector, /<select/);
  assert.doesNotMatch(clientSelector, />\s*Cliente\s*</);
  assert.doesNotMatch(unions, /openCreateRequestId/);
  assert.match(unions, /role="dialog"/);
  assert.match(unions, /backdrop-blur-sm/);
  assert.match(unions, /Criar sindicato/);
  assert.match(shell, /PessoalPayrollSection/);
  assert.match(shell, /activeTab === "payroll"/);
  assert.match(payroll, /usePessoalPayroll/);
  assert.match(payroll, /pessoalFormValueHelpers/);
  assert.match(formValueHelpers, /function optional\(value: string\): string \| null/);
  assert.match(
    formValueHelpers,
    /function optional<T>\(value: string, transform: \(value: string\) => T \| null\): T \| null/,
  );
  assert.match(formValueHelpers, /Number\.isFinite/);
  assert.doesNotMatch(payroll, /optionalText|optionalNumber/);
  assert.match(payroll, /Nenhuma configuração de folha cadastrada para este cliente/);
  assert.match(payroll, /ChevronDown/);
  assert.match(payroll, /appearance-none pr-12/);
  assert.match(payroll, /right-4/);
  assert.match(payroll, /type="checkbox"/);
  assert.match(payroll, /type="number"/);
  assert.match(shell, /PessoalObligationsSection/);
  assert.match(shell, /activeTab === "obligations"/);
  assert.match(obligations, /usePessoalObligation/);
  assert.match(obligations, /useGeneratePessoalObligationsMutation/);
  assert.match(obligations, /type="month"/);
  assert.match(obligations, /type="checkbox"/);
  assert.match(obligations, /Gerar/);
  assert.match(obligations, /Obrigações/);
  assert.match(obligations, /Competência/);
  assert.match(obligations, /Não foi possível/);
  assert.match(obligations, /Geração concluída/);
  assert.match(obligations, /setTimeout\(\(\) => \{/);
  assert.match(obligations, /}, 3000\)/);
  assert.match(shell, /PessoalTrackingSection/);
  assert.match(shell, /activeTab === "tracking"/);
  assert.match(tracking, /usePessoalLdd/);
  assert.match(tracking, /usePessoalSituations/);
  assert.match(tracking, /LDD/);
  assert.match(tracking, /Situações/);
  assert.match(tracking, /Período/);
  assert.match(tracking, /Título/);
  assert.match(tracking, /Descrição/);
  assert.match(tracking, /Concluída/);
  assert.match(tracking, /Não foi possível/);
  assert.match(tracking, /Criar LDD/);
  assert.match(tracking, /Criar situação/);
  assert.match(tracking, /isLddFormOpen/);
  assert.match(tracking, /isSituationFormOpen/);
  assert.match(tracking, /setIsLddFormOpen\(true\)/);
  assert.match(tracking, /setIsSituationFormOpen\(true\)/);
  assert.match(tracking, /role="dialog"/);
  assert.match(tracking, /aria-modal="true"/);
  assert.match(tracking, /backdrop-blur-sm/);
  assert.match(
    tracking,
    /\{isLddFormOpen \? \(\s*<div\s+className="fixed inset-0[^"]+"\s+onClick=\{\(\) => setIsLddFormOpen\(false\)\}[\s\S]*aria-labelledby="pessoal-ldd-form-title"/,
  );
  assert.match(
    tracking,
    /\{isSituationFormOpen \? \(\s*<div\s+className="fixed inset-0[^"]+"\s+onClick=\{\(\) => setIsSituationFormOpen\(false\)\}[\s\S]*aria-labelledby="pessoal-situation-form-title"/,
  );
  assert.equal(
    tracking.match(/onClick=\{\(event\) => event\.stopPropagation\(\)\}/g)?.length,
    2,
  );
  assert.match(tracking, /grid gap-3 sm:grid-cols-2/);
  assert.match(tracking, /ChevronDown/);
  assert.match(tracking, /appearance-none pr-12/);
  assert.match(tracking, /absolute right-4/);
  assert.match(tracking, /lddTypeOptions/);
  assert.match(tracking, /lddRegistrationStatusOptions/);
  assert.match(tracking, /lddStatusOptions/);
  assert.match(tracking, /field\.options/);
  assert.doesNotMatch(tracking, /border-t border-gray-200 pt-5/);
  assert.doesNotMatch(tracking, /<div className="grid gap-6">\s*<TrackingListCard/);
  assert.match(tracking, /actions\?: ReactNode/);
  assert.match(tracking, /actions=\{\s*canEdit \? \(/);
  assert.doesNotMatch(
    tracking,
    /onClick=\{activeTrackingTab === "ldd" \? startNewLdd : startNewSituation\}/,
  );
  assert.match(tracking, /confirm/);
  assert.match(tracking, /type: "date"/);
  assert.match(tracking, /type: "number"/);
  assert.match(shell, /PessoalPasswordsSection/);
  assert.match(shell, /activeTab === "passwords"/);
  assert.match(passwords, /usePessoalPasswords/);
  assert.match(passwords, /usePessoalPasswordDetail/);
  assert.match(passwords, /hasPessoalPasswordSecretFields/);
  assert.match(passwords, /type="search"/);
  assert.match(passwords, /Buscar por serviço ou responsável/);
  assert.match(passwords, /const hasPasswords = passwords\.length > 0/);
  assert.match(passwords, /\{hasPasswords \? \(/);
  assert.match(passwords, /revealedFields/);
  assert.match(passwords, /toggleSecretField/);
  assert.match(passwords, /navigator\.clipboard/);
  assert.match(passwords, /confirm/);
  assert.match(passwords, /Outro serviço/);
  assert.match(passwords, /isCustomService/);
  assert.match(passwords, /setIsCustomService\(true\)/);
  assert.match(passwords, /clearedSecretFields/);
  assert.match(passwords, /payload\[field\.name\] = null/);
  assert.match(passwords, /Limpar/);
  assert.match(passwords, /listAdminUsers/);
  assert.match(passwords, /ChevronDown/);
  assert.match(passwords, /appearance-none pr-12/);
  assert.match(passwords, /role="dialog"/);
  assert.match(passwords, /aria-modal="true"/);
  assert.match(passwords, /aria-label="Fechar senha"/);
  assert.match(passwords, /type="password"/);
  assert.match(passwords, /senha_main/);
  assert.match(passwords, /senha_secondary/);
  assert.doesNotMatch(passwords, />\s*Fechar\s*</);
  assert.doesNotMatch(passwords, />\s*Cancelar\s*</);
  assert.match(overview, /text-4xl/);
  assert.match(overview, /text-3xl/);
  assert.match(unions, /border-spacing-y-2/);
  assert.match(controls, /focus:border-blue-500/);
  assert.doesNotMatch(source, /(indigo|pink|purple|violet|fuchsia|rose)-/);
});

console.log("pessoal contract tests passed");
