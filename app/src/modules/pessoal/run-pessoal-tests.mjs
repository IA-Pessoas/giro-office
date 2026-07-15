import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PESSOAL_ENDPOINTS,
  PESSOAL_TABS,
  unwrapPessoalEnvelope,
} from "./services/pessoalService.contract.ts";
import { buildPessoalUnionPayload } from "./services/pessoalService.ts";
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

runTest("pessoal UI follows tecnologia-style system accent and centered tabs", () => {
  const shell = readFileSync("src/modules/pessoal/components/PessoalShell.tsx", "utf8");
  const overview = readFileSync("src/modules/pessoal/components/PessoalOverviewSection.tsx", "utf8");
  const placeholder = readFileSync(
    "src/modules/pessoal/components/PessoalPlaceholderSection.tsx",
    "utf8",
  );
  const controls = readFileSync("src/modules/pessoal/components/pessoalFormControls.ts", "utf8");
  const unions = readFileSync("src/modules/pessoal/components/PessoalUnionsSection.tsx", "utf8");
  const source = [shell, overview, placeholder, controls, unions].join("\n");

  assert.match(shell, /justify-center/);
  assert.match(shell, /dark:bg-gray-800/);
  assert.match(shell, /useClients/);
  assert.match(shell, /clientQuery\.data\?\.items/);
  assert.doesNotMatch(shell, /unionCreateRequestId/);
  assert.doesNotMatch(shell, /openCreateRequestId/);
  assert.doesNotMatch(shell, /PessoalOverviewSection hasClient/);
  assert.doesNotMatch(shell, /clients=\{\[\]\}/);
  assert.match(overview, /usePessoalUnions/);
  assert.doesNotMatch(overview, /onCreateUnion|canCreateUnion|Criar sindicato/);
  assert.match(overview, /Resumo operacional/);
  assert.match(overview, /featureCards/);
  assert.match(overview, /Folha/);
  assert.match(overview, /Obrigacoes/);
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
  const clientSelector = readFileSync(
    "src/modules/pessoal/components/PessoalClientSelector.tsx",
    "utf8",
  );

  assert.match(clientSelector, /aria-haspopup="listbox"/);
  assert.match(clientSelector, /Selecionar cliente/);
  assert.match(clientSelector, /Nenhum cliente disponivel/);
  assert.doesNotMatch(clientSelector, /<select/);
  assert.doesNotMatch(clientSelector, />\s*Cliente\s*</);
  assert.doesNotMatch(unions, /openCreateRequestId/);
  assert.match(unions, /role="dialog"/);
  assert.match(unions, /backdrop-blur-sm/);
  assert.match(unions, /Criar sindicato/);
  assert.match(overview, /text-4xl/);
  assert.match(overview, /text-3xl/);
  assert.match(unions, /border-spacing-y-2/);
  assert.doesNotMatch(source, /pink-/);
});

console.log("pessoal contract tests passed");
