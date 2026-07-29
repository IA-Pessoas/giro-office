import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildClientListParams,
  CLIENT_ENDPOINTS,
  unwrapClientEnvelope,
  unwrapClientPaDetail,
} from "./services/clientService.contract.ts";
import {
  buildCommercialPayload,
  COMMERCIAL_STATUS_OPTIONS,
  createCommercialInitialValues,
  hasCommercialChanges,
} from "./utils/commercialForm.ts";
import {
  formatCpfCnpjInput,
  validateCpfCnpjDocument,
  validateOptionalCpfDocument,
} from "./utils/documentValidation.ts";
import {
  buildFinancePayload,
  createFinanceInitialValues,
  hasFinanceChanges,
} from "./utils/financeForm.ts";
import {
  buildUpdateClientIntegrationPayload,
  createUpdateClientIntegrationInitialValues,
  hasUsableIntegrationData,
} from "./utils/integrationForm.ts";
import {
  buildRegularizePayload,
  createRegularizeInitialValues,
  getRegularizeUnsupportedDateClearError,
  hasRegularizeChanges,
} from "./utils/regularizeForm.ts";
import {
  mapClientStatusFromApi,
  mapClientStatusToApi,
} from "./utils/statusMapper.ts";
import {
  buildTerminationPayload,
  createTerminationInitialValues,
  isValidCompetenceOutput,
} from "./utils/terminationForm.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("mapClientStatusFromApi converts prospecting status to Prospect", () => {
  assert.equal(mapClientStatusFromApi("Prospecção"), "Prospect");
});

runTest("mapClientStatusToApi converts Prospect to API status", () => {
  assert.equal(mapClientStatusToApi("Prospect"), "Prospecção");
});

runTest("status mapper keeps unrelated values unchanged", () => {
  assert.equal(mapClientStatusFromApi("Ativo"), "Ativo");
  assert.equal(mapClientStatusToApi("Inativo"), "Inativo");
});

runTest("status mapper converts API active and inactive values to UI labels", () => {
  assert.equal(mapClientStatusFromApi("active"), "Ativo");
  assert.equal(mapClientStatusFromApi("inactive"), "Inativo");
});

runTest("status mapper preserves already-normalized inactive values from mixed environments", () => {
  assert.equal(mapClientStatusFromApi("Inativo"), "Inativo");
  assert.equal(mapClientStatusFromApi("Ativo"), "Ativo");
});

runTest("client endpoints use only /client contract", () => {
  assert.equal(CLIENT_ENDPOINTS.list, "/client/list");
  assert.equal(CLIENT_ENDPOINTS.create, "/client");
  assert.equal(CLIENT_ENDPOINTS.createIntegration, "/client/integration");
  assert.equal(CLIENT_ENDPOINTS.detail("123"), "/client/123");
  assert.equal(CLIENT_ENDPOINTS.updateIntegration("123"), "/client/123/integration");
  assert.equal(CLIENT_ENDPOINTS.updateCommercial("123"), "/client/123/commercial");
  assert.equal(CLIENT_ENDPOINTS.updateFinance("123"), "/client/123/finance");
  assert.equal(CLIENT_ENDPOINTS.updateRegularize("123"), "/client/123/regularize");
  assert.equal(CLIENT_ENDPOINTS.terminate("123"), "/client/123/termination");
  assert.equal(CLIENT_ENDPOINTS.activate("123"), "/client/123/activate");
  assert.equal(CLIENT_ENDPOINTS.detailPa("123"), "/client/123/pa");
  assert.equal(CLIENT_ENDPOINTS.createPa("123"), "/client/123/pa");
  assert.equal(CLIENT_ENDPOINTS.updatePa("123"), "/client/123/pa");
});

runTest("buildClientListParams forwards search, ref, status, page and limit", () => {
  const filters = {
    search: "acme",
    ref: "deps",
    status: "Departamento contabil",
    page: 2,
    limit: 15,
  };

  assert.deepEqual(buildClientListParams(filters), filters);
});

runTest("buildClientListParams uses legacy integration filter for active and inactive clients", () => {
  assert.deepEqual(buildClientListParams({ status: "Ativo", page: 1, limit: 10 }), {
    status: "Ativo",
    ref: "integracao",
    page: 1,
    limit: 10,
  });
  assert.deepEqual(buildClientListParams({ status: "Inativo", page: 1, limit: 10 }), {
    status: "Inativo",
    ref: "integracao",
    page: 1,
    limit: 10,
  });
});

runTest("buildClientListParams keeps the Regularize active-client query out of the legacy integration filter", () => {
  assert.deepEqual(
    buildClientListParams({
      status: "Ativo",
      page: 1,
      limit: 50,
      legacyIntegrationStatusFilter: false,
    }),
    { status: "Ativo", page: 1, limit: 50 },
  );
});

runTest("client integration filters use backend-supported not-contracted token", () => {
  const filters = readFileSync("src/modules/clients/components/ClientFilters.tsx", "utf8");

  assert.match(filters, /status: 'Não Contradados e Paralisados'/);
  assert.doesNotMatch(filters, /status: 'Não Contradado e Paralisado'/);
});

runTest("unwrapClientEnvelope normalizes response.data.data", () => {
  const payload = { items: [], total: 0, page: 1, pageSize: 20, hasMore: false };

  assert.deepEqual(unwrapClientEnvelope({ success: true, data: payload }), payload);
  assert.deepEqual(unwrapClientEnvelope(payload), payload);
});

runTest("unwrapClientPaDetail returns nested detail payload", () => {
  const detail = {
    client_id: "123",
    activities: "Retail",
    client: {
      email: "client@example.com",
    },
  };

  assert.deepEqual(unwrapClientPaDetail({ success: true, data: { detail } }), detail);
  assert.deepEqual(unwrapClientPaDetail({ detail }), detail);
});

runTest("integration edit hydration reuses client detail values", () => {
  const client = {
    id: "123",
    type: "PJ",
    name: "Acme",
    cpf_cnpj: "12.345.678/0001-90",
    company_name: "Acme LTDA",
    fantasy_name: "Acme",
    responsible: "Maria",
    cpf_responsible: "123.456.789-10",
    number: "11999999999",
    email: "contato@acme.com",
    agent: "Joao",
    cpf_agent: "987.654.321-00",
    instagram: "@acme",
    indication: "Google",
    type_registration: "Existente",
    service_unique: false,
    address: "Rua A, 10",
    cep: "01001-000",
    neighborhood: "Centro",
    state: "SP",
    city: "Sao Paulo",
  };

  assert.deepEqual(createUpdateClientIntegrationInitialValues(client), {
    type: "PJ",
    name: "Acme",
    cpf_cnpj: "12.345.678/0001-90",
    company_name: "Acme LTDA",
    fantasy_name: "Acme",
    responsible: "Maria",
    cpf_responsible: "123.456.789-10",
    number: "11999999999",
    email: "contato@acme.com",
    agent: "Joao",
    cpf_agent: "987.654.321-00",
    instagram: "@acme",
    indication: "Google",
    type_registration: "Existente",
    service_unique: false,
    address: "Rua A, 10",
    cep: "01001-000",
    neighborhood: "Centro",
    state: "SP",
    city: "Sao Paulo",
  });
});

runTest("integration update payload includes only changed supported fields", () => {
  const client = {
    id: "123",
    type: "PJ",
    name: "Acme",
    cpf_cnpj: "12345678000190",
    company_name: "Acme LTDA",
    fantasy_name: "Acme",
    responsible: "Maria",
    cpf_responsible: "12345678910",
    number: "11999999999",
    email: "contato@acme.com",
    agent: "Joao",
    cpf_agent: "98765432100",
    instagram: "@acme",
    indication: "Google",
    type_registration: "Existente",
    service_unique: false,
    address: "Rua A, 10",
    cep: "01001000",
    neighborhood: "Centro",
    state: "SP",
    city: "Sao Paulo",
  };

  const values = {
    ...createUpdateClientIntegrationInitialValues(client),
    cpf_cnpj: "12.345.678/0001-90",
    email: "financeiro@acme.com",
    service_unique: true,
    city: "Campinas",
  };

  assert.deepEqual(buildUpdateClientIntegrationPayload(values, client), {
    email: "financeiro@acme.com",
    service_unique: true,
    city: "Campinas",
  });
});

runTest("integration edit guard blocks when normalized cpf_cnpj is missing", () => {
  assert.equal(hasUsableIntegrationData({ cpf_cnpj: "12.345.678/0001-90" }), true);
  assert.equal(hasUsableIntegrationData({ cpf_cnpj: "   " }), false);
  assert.equal(hasUsableIntegrationData({ cpf_cnpj: "..../-" }), false);
  assert.equal(hasUsableIntegrationData(null), false);
});

runTest("document validation enforces base client cpf_cnpj length", () => {
  assert.equal(validateCpfCnpjDocument("123.456.789-10"), null);
  assert.equal(validateCpfCnpjDocument("12.345.678/0001-90"), null);
  assert.equal(validateCpfCnpjDocument("123"), "CPF/CNPJ deve ter 11 ou 14 dígitos.");
});

runTest("document validation enforces integration person type length", () => {
  assert.equal(validateCpfCnpjDocument("123.456.789-10", "PF"), null);
  assert.equal(validateCpfCnpjDocument("12.345.678/0001-90", "PJ"), null);
  assert.equal(validateCpfCnpjDocument("12.345.678/0001-90", "PF"), "CPF deve ter 11 dígitos.");
  assert.equal(validateCpfCnpjDocument("123.456.789-10", "PJ"), "CNPJ deve ter 14 dígitos.");
});

runTest("document input formatter masks and limits by person type", () => {
  assert.equal(formatCpfCnpjInput("123456789101112", "PF"), "123.456.789-10");
  assert.equal(formatCpfCnpjInput("123456789101112", "PJ"), "12.345.678/9101-11");
  assert.equal(formatCpfCnpjInput("abc1234", "PF"), "123.4");
  assert.equal(formatCpfCnpjInput("1234567", "PJ"), "12.345.67");
});

runTest("optional cpf validation accepts empty values and rejects invalid lengths", () => {
  assert.equal(validateOptionalCpfDocument("CPF do responsável", ""), null);
  assert.equal(validateOptionalCpfDocument("CPF do responsável", "123.456.789-10"), null);
  assert.equal(
    validateOptionalCpfDocument("CPF do responsável", "123"),
    "CPF do responsável deve ter 11 dígitos.",
  );
});

runTest("commercial options separate backend value from UI label", () => {
  assert.deepEqual(COMMERCIAL_STATUS_OPTIONS[0], {
    value: "Análise/Agendamento",
    label: "Análise/Agendamento",
  });
});

runTest("commercial warning explains the client-status impact without technical wording", () => {
  const commercialForm = readFileSync(
    "src/modules/clients/components/ClientCommercialForm.tsx",
    "utf8",
  );

  assert.match(
    commercialForm,
    /Alterar o status de prospecção pode impactar o status geral do cliente\./,
  );
  assert.doesNotMatch(commercialForm, /backend/i);
});

runTest("commercial initial values normalize dates to input format", () => {
  const client = {
    prospecting_status: "Análise/Agendamento",
    date_status: "2026-04-03T12:00:00.000Z",
    description_prospecting: "Primeiro contato",
    register_date_prospecting: new Date("2026-04-01T00:00:00.000Z"),
  };

  assert.deepEqual(createCommercialInitialValues(client), {
    prospecting_status: "Análise/Agendamento",
    date_status: "2026-04-03",
    description_prospecting: "Primeiro contato",
    register_date_prospecting: "2026-04-01",
  });
});

runTest("commercial payload keeps required status and only includes changed optional fields", () => {
  const client = {
    prospecting_status: "Análise/Agendamento",
    date_status: "2026-04-03T12:00:00.000Z",
    description_prospecting: "Primeiro contato",
    register_date_prospecting: "2026-04-01T00:00:00.000Z",
  };

  const values = {
    ...createCommercialInitialValues(client),
    prospecting_status: "Fechado",
    description_prospecting: "",
  };

  assert.deepEqual(buildCommercialPayload(values, client), {
    prospecting_status: "Fechado",
    description_prospecting: null,
  });
  assert.equal(hasCommercialChanges(values, client), true);
});

runTest("finance helpers block unchanged submit and send boolean payload", () => {
  const client = { contract: true };
  const initialValues = createFinanceInitialValues(client);

  assert.equal(hasFinanceChanges(initialValues, client), false);
  assert.deepEqual(buildFinancePayload({ contract: false }, client), { contract: false });
});

runTest("regularize payload normalizes documents, nullable text, and dates", () => {
  const client = {
    dominio_code: "123",
    name: "Acme",
    company_name: "Acme LTDA",
    fantasy_name: "Acme",
    cpf_cnpj: "12345678000190",
    cnae: "6201501",
    cnae_secondary: "",
    responsible: "Maria",
    cpf_responsible: "12345678910",
    number: "11999999999",
    email: "contato@acme.com",
    address: "Rua A, 10",
    cep: "01001000",
    neighborhood: "Centro",
    state: "SP",
    city: "Sao Paulo",
    customer_since: "2026-04-01T00:00:00.000Z",
    municipal_registration: "123",
    state_registration: "456",
    commercial_board_registration: "789",
    opening_date: "2020-01-01T00:00:00.000Z",
    regime: "Simples Nacional",
    size: "ME",
    segment: "Contabilidade",
    contabil: true,
    fiscal: false,
    pessoal: false,
    infoproduto: false,
    consultoria: true,
    start_strike: null,
    end_strike: null,
    deletion_date: null,
  };

  const values = {
    ...createRegularizeInitialValues(client),
    cpf_cnpj: "12.345.678/0001-90",
    cpf_responsible: "",
    cnae_secondary: "6202300",
    city: "Campinas",
    customer_since: "2026-04-02",
  };

  assert.deepEqual(buildRegularizePayload(values, client), {
    cpf_responsible: null,
    cnae_secondary: "6202300",
    city: "Campinas",
    customer_since: "2026-04-02",
  });
  assert.equal(hasRegularizeChanges(values, client), true);
});

runTest("regularize blocks clearing non-nullable dates and ignores invalid clear as effective change", () => {
  const client = {
    dominio_code: "",
    name: "Acme",
    company_name: "",
    fantasy_name: "",
    cpf_cnpj: "12345678000190",
    cnae: "",
    cnae_secondary: "",
    responsible: "",
    cpf_responsible: "",
    number: "",
    email: "",
    address: "",
    cep: "",
    neighborhood: "",
    state: "",
    city: "",
    customer_since: "2026-04-01T00:00:00.000Z",
    municipal_registration: "",
    state_registration: "",
    commercial_board_registration: "",
    opening_date: null,
    regime: "",
    size: "",
    segment: "",
    contabil: false,
    fiscal: false,
    pessoal: false,
    infoproduto: false,
    consultoria: false,
    start_strike: null,
    end_strike: null,
    deletion_date: null,
  };

  const values = {
    ...createRegularizeInitialValues(client),
    customer_since: "",
  };

  assert.deepEqual(buildRegularizePayload(values, client), {});
  assert.equal(hasRegularizeChanges(values, client), false);
  assert.equal(
    getRegularizeUnsupportedDateClearError(values, client),
    "Não é possível limpar cliente desde neste fluxo. Informe uma data válida.",
  );
});

runTest("termination helpers validate competence_output and build payload", () => {
  assert.deepEqual(createTerminationInitialValues(), {
    reason: "",
    description: "",
    competence_output: "",
  });
  assert.equal(isValidCompetenceOutput("2026-05"), true);
  assert.equal(isValidCompetenceOutput("2026-5"), false);
  assert.deepEqual(
    buildTerminationPayload({
      reason: " Encerramento ",
      description: " Finalizar contrato ",
      competence_output: "2026-05",
    }),
    {
      reason: "Encerramento",
      description: "Finalizar contrato",
      competence_output: "2026-05",
    },
  );
});

runTest("client picker keeps paginated remote search and accessible feedback", () => {
  const picker = readFileSync("src/modules/clients/components/ClientPickerModal.tsx", "utf8");
  const moduleIndex = readFileSync("src/modules/clients/index.ts", "utf8");

  assert.match(moduleIndex, /ClientPickerModal/);
  assert.match(picker, /useDeferredValue/);
  assert.match(picker, /useClients\(\{[\s\S]*?\.\.\.filters,[\s\S]*?search: deferredSearch,[\s\S]*?page,[\s\S]*?limit: CLIENT_PICKER_LIMIT/);
  assert.match(picker, /client\.company_name \|\| client\.name/);
  assert.match(picker, /role="dialog"/);
  assert.match(picker, /role="alert"/);
  assert.match(picker, /htmlFor=\{searchInputId\}/);
  assert.match(picker, /role="listbox"/);
  assert.match(picker, /handleSelect\(null\)/);
});

runTest("client create modal binds person type to document validation and payload", () => {
  const modal = readFileSync("src/modules/clients/components/ClientCreateModal.tsx", "utf8");
  const form = readFileSync("src/modules/clients/components/ClientForm.tsx", "utf8");

  assert.match(modal, /type: "PJ"/);
  assert.match(modal, /setShowDocumentError\(true\)/);
  assert.match(modal, /setShowDocumentError\(false\)/);
  assert.match(modal, /formatCpfCnpjInput/);
  assert.match(modal, /validateCpfCnpjDocument\(formValues\.cpf_cnpj,\s*formValues\.type\)/);
  assert.match(modal, /type: formValues\.type/);
  assert.match(modal, /showPersonType/);
  assert.match(modal, /showDocumentError/);
  assert.match(form, /name="type"/);
  assert.match(form, /showDocumentError && showPersonType && values\.cpf_cnpj/);
  assert.ok(form.indexOf(">Nome</span>") < form.indexOf(">Razão social</span>"));
  assert.ok(form.indexOf(">Razão social</span>") < form.indexOf(">Tipo de pessoa</span>"));
  assert.ok(form.indexOf(">Tipo de pessoa</span>") < form.indexOf("{documentLabel}"));
  assert.ok(form.indexOf(">Nome fantasia</span>") < form.indexOf(">Status</span>"));
  assert.doesNotMatch(form, /rounded-2xl border border-slate-200 bg-slate-50/);
});

runTest("clients list exposes compact page jump input", () => {
  const clients = readFileSync("src/shared/components/newLayout/Clients.tsx", "utf8");

  assert.match(clients, /import \{ DEFAULT_PAGE_SIZE \} from "@shared\/pagination\/pagination";/);
  assert.match(clients, /const limit = DEFAULT_PAGE_SIZE;/);
  assert.match(clients, /useEffect/);
  assert.match(clients, /const \[pageInputValue, setPageInputValue\] = useState\(String\(page\)\)/);
  assert.match(clients, /setPageInputValue\(String\(currentPage\)\)/);
  assert.match(clients, /const pageInputSize = Math\.max\(1, pageInputValue\.length\)/);
  assert.match(clients, /const pageInputWidthClassName =/);
  assert.match(clients, /"w-\[3ch\]"/);
  assert.match(clients, /function goToPage\(value: string\)/);
  assert.match(clients, /Math\.min\(pageCount, Math\.max\(1, nextPage\)\)/);
  assert.match(clients, /setPageInputValue\(String\(clampedPage\)\)/);
  assert.match(clients, /aria-label="Ir para página"/);
  assert.match(clients, /type="text"/);
  assert.match(clients, /inputMode="numeric"/);
  assert.match(clients, /pattern="\[0-9\]\*"/);
  assert.match(clients, /size=\{pageInputSize\}/);
  assert.match(clients, /value=\{pageInputValue\}/);
  assert.match(clients, /setPageInputValue\(event\.target\.value\.replace\(\/\\D\/g, ""\)\)/);
  assert.match(clients, /pageInputWidthClassName/);
  assert.doesNotMatch(clients, /style=\{\{ width:/);
  assert.doesNotMatch(clients, /min-w-\[/);
  assert.doesNotMatch(clients, /w-16/);
  assert.match(clients, /onBlur=\{\(event\) => goToPage\(event\.target\.value\)\}/);
  assert.match(clients, /onKeyDown=\{\(event\) =>/);
});

runTest("client creation discloses name and document as required", () => {
  const source = readFileSync("src/modules/clients/components/ClientForm.tsx", "utf8");

  assert.match(source, /RequiredFieldLabel/);
  assert.match(source, /name="name"[\s\S]*aria-required/);
  assert.match(source, /name="cpf_cnpj"[\s\S]*aria-required/);
});
