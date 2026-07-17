import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PESSOAL_ENDPOINTS,
  PESSOAL_TABS,
  unwrapPessoalEnvelope,
} from "./services/pessoalService.contract.ts";
import {
  buildPessoalLddListParams,
  buildPessoalObligationParams,
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
  assert.match(clientSelector, /useClients\(/);
  assert.match(clientSelector, /handleSelect\(null\)/);
  assert.match(clientSelector, /role="dialog"/);
});

runTest("client-scoped sections block requests without selected client", () => {
  for (const file of [
    "PessoalPayrollSection.tsx",
    "PessoalObligationsSection.tsx",
    "PessoalTrackingSection.tsx",
    "PessoalPasswordsSection.tsx",
  ]) {
    const source = readFileSync(`src/modules/pessoal/components/${file}`, "utf8");

    assert.match(source, /if \(!hasClient\)/);
    assert.match(source, /PessoalPlaceholderSection/);
  }
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
