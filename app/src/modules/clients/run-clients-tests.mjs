import assert from "node:assert/strict";

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
  CLIENT_ALREADY_INACTIVE_MESSAGE,
  getClientTerminationAccess,
} from "./utils/terminationAccess.ts";
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

runTest("termination access blocks inactive clients with explicit message", () => {
  assert.deepEqual(getClientTerminationAccess("Inativo"), {
    canOpen: false,
    message: CLIENT_ALREADY_INACTIVE_MESSAGE,
  });
  assert.deepEqual(getClientTerminationAccess("inactive"), {
    canOpen: false,
    message: CLIENT_ALREADY_INACTIVE_MESSAGE,
  });
  assert.deepEqual(getClientTerminationAccess("Inativo PJ"), {
    canOpen: false,
    message: CLIENT_ALREADY_INACTIVE_MESSAGE,
  });
});

runTest("termination access allows clients that are not inactive", () => {
  assert.deepEqual(getClientTerminationAccess("Ativo"), { canOpen: true });
  assert.deepEqual(getClientTerminationAccess("Prospect"), { canOpen: true });
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

runTest("buildClientListParams forwards search, status, page and limit", () => {
  const filters = {
    search: "acme",
    status: "Prospect",
    page: 2,
    limit: 15,
  };

  assert.deepEqual(buildClientListParams(filters), filters);
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
