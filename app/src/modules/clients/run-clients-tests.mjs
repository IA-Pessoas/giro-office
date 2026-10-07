import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formatBrazilianPhoneInput,
  formatCnpjInput,
  formatCpfInput,
} from "../../shared/utils/inputFormatting.ts";
import { forwardFormattedInputChange } from "./components/formattedInputChange.ts";
import {
  buildClientListParams,
  CLIENT_ENDPOINTS,
  unwrapClientEnvelope,
  unwrapClientPaDetail,
} from "./services/clientService.contract.ts";
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
  buildCreateClientIntegrationPayload,
  buildUpdateClientIntegrationPayload,
  createClientIntegrationInitialValues,
  createUpdateClientIntegrationInitialValues,
  getCnpjToLookup,
  getIntegrationEmailError,
  getPhoneInputHint,
  hasUsableIntegrationData,
} from "./utils/integrationForm.ts";
import { formatPaMoneyFromApi, formatPaMoneyInput, parsePaMoneyCents } from "./utils/paForm.ts";
import {
  buildRegularizePayload,
  createRegularizeInitialValues,
  isRegularizeCompanyClient,
  getRegularizeUnsupportedDateClearError,
  getRegularizeRegimeOptions,
  hasRegularizeChanges,
} from "./utils/regularizeForm.ts";
import { FISCAL_TAX_REGIME_OPTIONS } from "../fiscal/utils/fiscalTaxRegime.ts";
import {
  getClientLifecycleActions,
  mapClientStatusFromApi,
  mapClientStatusToApi,
} from "./utils/statusMapper.ts";
import {
  buildTerminationPayload,
  createTerminationInitialValues,
  isValidCompetenceOutput,
} from "./utils/terminationForm.ts";
import {
  buildCreateClientPayload,
  buildUpdateClientPayload,
  CLIENT_TAX_REGIME_OPTIONS,
  createClientFormInitialValues,
  getClientTaxRegime,
} from "./utils/clientForm.ts";
import { getDocumentIssue } from "../../shared/utils/documentIssue.ts";
import { toDatetimeLocalValue, toHistoryIsoDate } from "./utils/historyDate.ts";
import { canDeleteClientHistory, canManageClientHistories } from "./utils/historyAccess.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function assertFormattedInputEventContract(format, rawValue, expectedValue) {
  const originalTarget = {
    name: "cpf_cnpj",
    type: "text",
    checked: false,
    value: rawValue,
  };
  const originalCurrentTarget = {
    name: "cpf_cnpj",
    type: "text",
    checked: false,
    value: rawValue,
  };
  const originalEvent = {
    type: "change",
    target: originalTarget,
    currentTarget: originalCurrentTarget,
  };
  let receivedEvent;

  forwardFormattedInputChange(originalEvent, format, (event) => {
    receivedEvent = event;
  });

  assert.strictEqual(receivedEvent, originalEvent);
  assert.equal(receivedEvent.type, "change");
  assert.equal(receivedEvent.target.name, "cpf_cnpj");
  assert.equal(receivedEvent.target.type, "text");
  assert.equal(receivedEvent.target.checked, false);
  assert.equal(receivedEvent.target.value, expectedValue);
  assert.equal(receivedEvent.currentTarget.name, "cpf_cnpj");
  assert.equal(receivedEvent.currentTarget.type, "text");
  assert.equal(receivedEvent.currentTarget.checked, false);
  assert.equal(receivedEvent.currentTarget.value, expectedValue);
}

runTest("mapClientStatusFromApi converts prospecting status to Prospect", () => {
  assert.equal(mapClientStatusFromApi("Prospecção"), "Prospect");
});

runTest("client form sends the selected tax regime on creation and update", () => {
  assert.deepEqual(CLIENT_TAX_REGIME_OPTIONS, [
    "Simples Nacional",
    "Lucro Presumido",
    "Lucro Real",
  ]);
  assert.equal(getClientTaxRegime("Lucro Presumido"), "Lucro Presumido");
  assert.equal(getClientTaxRegime("MEI"), "");
  assert.equal(getClientTaxRegime(null), "");
  assert.equal(createClientFormInitialValues({ regime: null }).regime, "");

  const values = {
    ...createClientFormInitialValues(),
    type: "PJ",
    name: "Acme",
    company_name: "Acme LTDA",
    fantasy_name: "Acme",
    cpf_cnpj: "12.345.678/0001-90",
    regime: "Simples Nacional",
  };

  assert.equal(buildCreateClientPayload(values, "organization-1").regime, "Simples Nacional");
  assert.equal(
    buildUpdateClientPayload({ ...values, regime: "Lucro Presumido" }).regime,
    "Lucro Presumido",
  );
  assert.equal(buildUpdateClientPayload({ ...values, regime: "" }).regime, null);
  assert.equal(
    "regime" in buildUpdateClientPayload({ ...values, regime: "" }, "MEI"),
    false,
  );
});

runTest("new client form sends Ativo when status remains unchanged", () => {
  const values = {
    ...createClientFormInitialValues(),
    name: "Acme",
    cpf_cnpj: "12.345.678/0001-90",
  };

  assert.equal(values.status, "Ativo");
  assert.equal(buildCreateClientPayload(values, "organization-1").status, "Ativo");
});

runTest("common client creation sends optional address and preserves client identity", () => {
  const values = {
    ...createClientFormInitialValues(),
    name: "Acme",
    cpf_cnpj: "12.345.678/0001-90",
    address: " Rua A, 10 ",
    cep: "01001-000",
    neighborhood: "Centro",
    state: "SP",
    city: "São Paulo",
  };
  assert.deepEqual(
    (({ address, cep, neighborhood, state, city, cpf_cnpj }) => ({
      address, cep, neighborhood, state, city, cpf_cnpj,
    }))(buildCreateClientPayload(values, "organization-1")),
    {
      address: "Rua A, 10",
      cep: "01001-000",
      neighborhood: "Centro",
      state: "SP",
      city: "São Paulo",
      cpf_cnpj: "12345678000190",
    },
  );
});

runTest("common client update sends optional address without changing identity or contact fields", () => {
  const values = {
    ...createClientFormInitialValues(),
    name: "Acme",
    cpf_cnpj: "12.345.678/0001-90",
    address: " Rua B, 20 ",
    cep: "02002-000",
    neighborhood: "Bairro",
    state: "RJ",
    city: "Rio de Janeiro",
  };
  const payload = buildUpdateClientPayload(values);

  assert.deepEqual(
    (({ address, cep, neighborhood, state, city, name, cpf_cnpj }) => ({
      address, cep, neighborhood, state, city, name, cpf_cnpj,
    }))(payload),
    {
      address: "Rua B, 20",
      cep: "02002-000",
      neighborhood: "Bairro",
      state: "RJ",
      city: "Rio de Janeiro",
      name: "Acme",
      cpf_cnpj: "12345678000190",
    },
  );
  assert.equal("number" in payload, false);
  assert.equal("email" in payload, false);
});

runTest("PJ client payloads derive the required API name while PF keeps its entered name", () => {
  const pjValues = {
    ...createClientFormInitialValues(),
    type: "PJ",
    name: "",
    company_name: "Empresa Exemplo LTDA",
    fantasy_name: "Exemplo",
  };

  assert.equal(buildCreateClientPayload(pjValues, "organization-1").name, "Empresa Exemplo LTDA");
  assert.equal(
    buildCreateClientPayload(
      { ...pjValues, company_name: "", fantasy_name: "Nome Fantasia" },
      "organization-1",
    ).name,
    "Nome Fantasia",
  );
  assert.equal(
    buildUpdateClientPayload({ ...pjValues, company_name: "Nova Razão Social" }).name,
    "Nova Razão Social",
  );

  const pfValues = { ...pjValues, type: "PF", name: "Pessoa Exemplo", company_name: "" };
  assert.equal(buildCreateClientPayload(pfValues, "organization-1").name, "Pessoa Exemplo");
});

runTest("PJ integration creation derives required API name from company identity", () => {
  const values = {
    ...createClientIntegrationInitialValues(),
    type: "PJ",
    name: "",
    company_name: "Empresa Integração LTDA",
    fantasy_name: "Integração",
  };

  assert.equal(
    buildCreateClientIntegrationPayload(values, "organization-1").name,
    "Empresa Integração LTDA",
  );

  const client = { ...values, name: "", company_name: "", fantasy_name: "" };
  assert.equal(
    buildUpdateClientIntegrationPayload(
      { ...createUpdateClientIntegrationInitialValues(client), name: "", company_name: "Nova LTDA" },
      client,
    ).name,
    "Nova LTDA",
  );
});

runTest("client integration preserves the shared tax regime through create and edit", () => {
  const values = {
    ...createClientIntegrationInitialValues(),
    regime: "Simples Nacional",
  };

  const payload = buildCreateClientIntegrationPayload(values, "organization-1");
  assert.equal(payload.regime, "Simples Nacional");
  assert.equal(payload.type_registration, "Existente");

  const client = { ...values, regime: "Simples Nacional" };
  const initialValues = createUpdateClientIntegrationInitialValues(client);
  assert.equal(initialValues.regime, "Simples Nacional");
  const editedValues = { ...initialValues, regime: "Lucro Real" };
  assert.equal(buildUpdateClientIntegrationPayload(editedValues, client).regime, "Lucro Real");

  const legacyClient = { ...client, regime: "MEI" };
  const legacyValues = createUpdateClientIntegrationInitialValues(legacyClient);
  assert.equal("regime" in buildUpdateClientIntegrationPayload(legacyValues, legacyClient), false);
});

runTest("integration form keeps tax regime separate from registration type", () => {
  const form = readFileSync("src/modules/clients/components/ClientIntegrationForm.tsx", "utf8");
  assert.match(form, /Tipo de Registro[\s\S]*?name="type_registration"/);
  assert.match(form, /Regime tributário[\s\S]*?name="regime"[\s\S]*?CLIENT_TAX_REGIME_OPTIONS/);
});

runTest("client creation forms expose optional address fields", () => {
  const clientForm = readFileSync("src/modules/clients/components/ClientForm.tsx", "utf8");
  const integrationForm = readFileSync(
    "src/modules/clients/components/ClientIntegrationForm.tsx",
    "utf8",
  );
  const addressFields = readFileSync("src/modules/clients/form/ClientAddressFields.tsx", "utf8");
  assert.match(clientForm, /<ClientAddressFields/);
  assert.match(integrationForm, /<ClientAddressFields/);
  for (const field of ["address", "cep", "neighborhood", "state", "city"]) {
    assert.match(addressFields, new RegExp(`name="${field}"`));
  }
});

runTest("PJ client forms hide manual name while PF forms retain it", () => {
  const clientForm = readFileSync("src/modules/clients/components/ClientForm.tsx", "utf8");
  const integrationForm = readFileSync(
    "src/modules/clients/components/ClientIntegrationForm.tsx",
    "utf8",
  );
  const regularizeForm = readFileSync(
    "src/modules/clients/components/ClientRegularizeForm.tsx",
    "utf8",
  );
  assert.match(clientForm, /values\.type === "PF"[\s\S]*?name="name"/);
  assert.match(integrationForm, /values\.type === "PF"[\s\S]*?name="name"/);
  assert.doesNotMatch(regularizeForm, /label="Nome \/ Apelido"/);
  assert.match(regularizeForm, /isRegularizeCompanyClient\(values\)/);
});

runTest("regularization uses client type to identify PJ despite incomplete identity fields", () => {
  assert.equal(
    isRegularizeCompanyClient({ type: "PJ", cpf_cnpj: "12.345", company_name: "Empresa LTDA", fantasy_name: "" }),
    true,
  );
  assert.equal(
    isRegularizeCompanyClient({ type: "PJ", cpf_cnpj: "", company_name: "", fantasy_name: "Marca" }),
    true,
  );
  assert.equal(
    isRegularizeCompanyClient({ type: "PF", cpf_cnpj: "", company_name: "Empresa LTDA", fantasy_name: "" }),
    false,
  );
  assert.equal(
    isRegularizeCompanyClient({ type: "PJ", cpf_cnpj: "", company_name: "", fantasy_name: "" }),
    true,
  );
  assert.equal(
    isRegularizeCompanyClient({ type: "PF", cpf_cnpj: "12.345.678/0001-90", company_name: "", fantasy_name: "" }),
    false,
  );
});

runTest("client regime is constrained and bound in both shared client flows", () => {
  const types = readFileSync("src/modules/clients/types/index.ts", "utf8");
  const form = readFileSync("src/modules/clients/components/ClientForm.tsx", "utf8");
  const createModal = readFileSync("src/modules/clients/components/ClientCreateModal.tsx", "utf8");
  const detailPage = readFileSync("src/pages/clients/[id].tsx", "utf8");

  assert.match(
    types,
    /export type ClientTaxRegime = "Simples Nacional" \| "Lucro Presumido" \| "Lucro Real"/,
  );
  assert.match(types, /regime: ClientTaxRegime \| "";/);
  assert.match(form, /name="regime"[\s\S]*?CLIENT_TAX_REGIME_OPTIONS/);
  assert.match(form, /legacyTaxRegime && values\.regime === ""/);
  assert.match(form, /Regime atual:/);
  assert.match(createModal, /buildCreateClientPayload\(formValues, organizationId\)/);
  assert.match(detailPage, /createClientFormInitialValues\(client\)/);
  assert.match(detailPage, /buildUpdateClientPayload\(formValues, client\.regime\)/);
  assert.match(detailPage, /legacyTaxRegime=\{client\.regime\}/);
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
  assert.equal(CLIENT_ENDPOINTS.instagramProfilesReport, "/client/instagram-profiles/report");
  assert.equal(CLIENT_ENDPOINTS.create, "/client");
  assert.equal(CLIENT_ENDPOINTS.createIntegration, "/client/integration");
  assert.equal(CLIENT_ENDPOINTS.detail("123"), "/client/123");
  assert.equal(CLIENT_ENDPOINTS.updateIntegration("123"), "/client/123/integration");
  assert.equal(CLIENT_ENDPOINTS.updateFinance("123"), "/client/123/finance");
  assert.equal(CLIENT_ENDPOINTS.updateRegularize("123"), "/client/123/regularize");
  assert.equal(CLIENT_ENDPOINTS.terminate("123"), "/client/123/termination");
  assert.equal(CLIENT_ENDPOINTS.activate("123"), "/client/123/activate");
  assert.equal(CLIENT_ENDPOINTS.detailPa("123"), "/client/123/pa");
  assert.equal(CLIENT_ENDPOINTS.createPa("123"), "/client/123/pa");
  assert.equal(CLIENT_ENDPOINTS.updatePa("123"), "/client/123/pa");
});

runTest("client detail exposes partners management in the main Clients module", () => {
  const detailPage = readFileSync("src/pages/clients/[id].tsx", "utf8");

  assert.match(detailPage, /ClientPartnersSection/);
  assert.match(detailPage, /isCompanyClient.*cpf_cnpj.*length === 14/);
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

runTest("main clients list disables the legacy integration status filter", () => {
  const clients = readFileSync("src/shared/components/newLayout/Clients.tsx", "utf8");

  assert.match(clients, /legacyIntegrationStatusFilter:\s*false/);
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

runTest("integration create payload sends a canonical phone", () => {
  assert.equal(
    buildCreateClientIntegrationPayload(
      {
        type: "PJ",
        name: "Acme",
        cpf_cnpj: "12.345.678/0001-90",
        company_name: "",
        fantasy_name: "",
        opening_date: "",
        responsible: "",
        cpf_responsible: "",
        number: "(11) 99999-9999",
        email: "",
        agent: "",
        cpf_agent: "",
        instagram: "",
        indication: "",
        participants_meet: "",
        meet_type: "",
        type_registration: "Existente",
        service_unique: false,
      },
      "organization-1",
    ).number,
    "11999999999",
  );
});

runTest("integration create payload sends optional address without changing contact and identity", () => {
  const values = {
    ...createClientIntegrationInitialValues(),
    name: "Acme",
    cpf_cnpj: "12.345.678/0001-90",
    number: "(11) 99999-9999",
    email: "contato@acme.com",
    address: " Rua A, 10 ",
    cep: "01001-000",
    neighborhood: " Centro ",
    state: "SP",
    city: "São Paulo",
  };
  assert.deepEqual(
    (({ address, cep, neighborhood, state, city, number, email, cpf_cnpj }) => ({
      address, cep, neighborhood, state, city, number, email, cpf_cnpj,
    }))(buildCreateClientIntegrationPayload(values, "organization-1")),
    {
      address: "Rua A, 10",
      cep: "01001-000",
      neighborhood: "Centro",
      state: "SP",
      city: "São Paulo",
      number: "11999999999",
      email: "contato@acme.com",
      cpf_cnpj: "12345678000190",
    },
  );
});

runTest("integration edit hydration masks client documents and phone", () => {
  const client = {
    id: "123",
    type: "PJ",
    name: "Acme",
    cpf_cnpj: "12345678000190",
    company_name: "Acme LTDA",
    fantasy_name: "Acme",
    regime: "Lucro Presumido",
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
    cep: "01001-000",
    neighborhood: "Centro",
    state: "SP",
    city: "Sao Paulo",
  };

  assert.deepEqual(createUpdateClientIntegrationInitialValues(client), {
    type: "PJ",
    regime: "Lucro Presumido",
    name: "Acme",
    cpf_cnpj: "12.345.678/0001-90",
    company_name: "Acme LTDA",
    fantasy_name: "Acme",
    responsible: "Maria",
    cpf_responsible: "123.456.789-10",
    number: "(11) 99999-9999",
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

  assert.equal(
    createUpdateClientIntegrationInitialValues({
      ...client,
      type: "PF",
      cpf_cnpj: "12345678910",
    }).cpf_cnpj,
    "123.456.789-10",
  );
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

runTest("integration phone comparison and payload use canonical digits", () => {
  const client = {
    id: "123",
    type: "PJ",
    name: "Acme",
    cpf_cnpj: "12345678000190",
    company_name: "",
    fantasy_name: "",
    responsible: "",
    cpf_responsible: "",
    number: "11999999999",
    email: "",
    agent: "",
    cpf_agent: "",
    instagram: "",
    indication: "",
    type_registration: "Existente",
    service_unique: false,
    address: "",
    cep: "",
    neighborhood: "",
    state: "",
    city: "",
  };
  const initialValues = createUpdateClientIntegrationInitialValues(client);

  assert.deepEqual(
    buildUpdateClientIntegrationPayload(
      { ...initialValues, number: "11 99999.9999" },
      client,
    ),
    {},
  );
  assert.deepEqual(
    buildUpdateClientIntegrationPayload(
      { ...initialValues, number: "(11) 98888-7777" },
      client,
    ),
    { number: "11988887777" },
  );
});

runTest("integration edit guard blocks when normalized cpf_cnpj is missing", () => {
  assert.equal(hasUsableIntegrationData({ cpf_cnpj: "12.345.678/0001-90" }), true);
  assert.equal(hasUsableIntegrationData({ type: "PJ", cpf_cnpj: "AB123456780001" }), true);
  assert.equal(hasUsableIntegrationData({ cpf_cnpj: "   " }), false);
  assert.equal(hasUsableIntegrationData({ cpf_cnpj: "..../-" }), false);
  assert.equal(hasUsableIntegrationData(null), false);
});

runTest("document validation enforces base client cpf_cnpj length and check digits", () => {
  assert.equal(validateCpfCnpjDocument("529.982.247-25"), null);
  assert.equal(validateCpfCnpjDocument("12.345.678/0001-95"), null);
  assert.equal(validateCpfCnpjDocument("123"), "CPF/CNPJ deve ter 11 ou 14 dígitos.");
});

runTest("document validation enforces integration person type length", () => {
  assert.equal(validateCpfCnpjDocument("529.982.247-25", "PF"), null);
  assert.equal(validateCpfCnpjDocument("12.345.678/0001-95", "PJ"), null);
  assert.equal(validateCpfCnpjDocument("12.345.678/0001-90", "PF"), "CPF deve ter 11 dígitos.");
  assert.equal(validateCpfCnpjDocument("123.456.789-10", "PJ"), "CNPJ deve ter 14 dígitos.");
});

runTest("document input formatter masks and limits by person type", () => {
  assert.equal(formatCpfCnpjInput("123456789101112", "PF"), "123.456.789-10");
  assert.equal(formatCpfCnpjInput("123456789101112", "PJ"), "12.345.678/9101-11");
  assert.equal(formatCpfCnpjInput("abc1234", "PF"), "123.4");
  assert.equal(formatCpfCnpjInput("1234567", "PJ"), "12.345.67");
  assert.equal(formatCpfCnpjInput("AB123456780001", "PJ"), "AB.123.456/7800-01");
  assert.equal(validateCpfCnpjDocument("AB.123.456/7800-26", "PJ"), null);
});

runTest("client input masks forward formatted document and phone values through event-compatible targets", () => {
  assertFormattedInputEventContract(
    formatCpfInput,
    "12345678910",
    "123.456.789-10",
  );
  assertFormattedInputEventContract(
    formatCnpjInput,
    "12345678000190",
    "12.345.678/0001-90",
  );
  assertFormattedInputEventContract(
    formatBrazilianPhoneInput,
    "11999999999",
    "(11) 99999-9999",
  );
});

runTest("client integration fields route type-specific documents and phones through local mask adapters", () => {
  const source = readFileSync("src/modules/clients/components/ClientIntegrationForm.tsx", "utf8");

  assert.match(source, /from "@shared\/utils\/inputFormatting"/);
  assert.match(source, /formatCpfInput/);
  assert.match(source, /formatCnpjInput/);
  assert.match(source, /formatBrazilianPhoneInput/);
  assert.match(source, /from "\.\/formattedInputChange"/);
  assert.match(source, /forwardFormattedInputChange/);
  assert.match(source, /values\.type === "PJ" \? formatCnpjInput : formatCpfInput/);
  assert.match(source, /name="cpf_cnpj"[\s\S]{0,180}onChange=\{handleCpfCnpjChange\}/);
  assert.match(source, /name="cpf_responsible"[\s\S]{0,180}onChange=\{handleCpfChange\}/);
  assert.match(source, /name="cpf_agent"[\s\S]{0,180}onChange=\{handleCpfChange\}/);
  assert.match(source, /name="number"[\s\S]{0,180}onChange=\{handlePhoneChange\}/);
});

runTest("client Regularize fields route generic documents, CPF, and phones through local mask adapters", () => {
  const source = readFileSync("src/modules/clients/components/ClientRegularizeForm.tsx", "utf8");

  assert.match(source, /from "@shared\/utils\/inputFormatting"/);
  assert.match(source, /formatCpfCnpjInput/);
  assert.match(source, /formatCpfInput/);
  assert.match(source, /formatBrazilianPhoneInput/);
  assert.match(source, /from "\.\/formattedInputChange"/);
  assert.match(source, /forwardFormattedInputChange/);
  assert.match(source, /name="cpf_cnpj"[\s\S]{0,180}onChange=\{handleCpfCnpjChange\}/);
  assert.match(source, /name="cpf_responsible"[\s\S]{0,180}onChange=\{handleCpfChange\}/);
  assert.match(source, /name="number"[\s\S]{0,180}onChange=\{handlePhoneChange\}/);
});

runTest("optional cpf validation accepts empty values and rejects invalid lengths", () => {
  assert.equal(validateOptionalCpfDocument("CPF do responsável", ""), null);
  assert.equal(validateOptionalCpfDocument("CPF do responsável", "529.982.247-25"), null);
  assert.equal(
    validateOptionalCpfDocument("CPF do responsável", "123"),
    "CPF do responsável deve ter 11 dígitos.",
  );
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

runTest("regularize hydration masks documents and phone while phone payload stays canonical", () => {
  const client = {
    id: "client-1",
    type: "PJ",
    name: "Acme",
    cpf_cnpj: "12345678000190",
    cpf_responsible: "12345678910",
    number: "11999999999",
  };
  const initialValues = createRegularizeInitialValues(client);

  assert.equal(initialValues.type, "PJ");
  assert.equal(initialValues.cpf_cnpj, "12.345.678/0001-90");
  assert.equal(initialValues.cpf_responsible, "123.456.789-10");
  assert.equal(initialValues.number, "(11) 99999-9999");
  const changedOnlyType = { ...initialValues, type: "PF" };
  assert.deepEqual(buildRegularizePayload(changedOnlyType, client), {});
  assert.equal(hasRegularizeChanges(changedOnlyType, client), false);
  assert.deepEqual(
    buildRegularizePayload(
      { ...initialValues, number: "11 99999.9999" },
      client,
    ),
    {},
  );
  assert.deepEqual(
    buildRegularizePayload(
      { ...initialValues, number: "(11) 98888-7777" },
      client,
    ),
    { number: "11988887777" },
  );
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
  assert.match(picker, /name: getClientDisplayName\(client\)/);
  assert.match(picker, /role="dialog"/);
  assert.match(picker, /role="alert"/);
  assert.match(picker, /htmlFor=\{searchInputId\}/);
  assert.match(picker, /role="listbox"/);
  assert.match(picker, /handleSelect\(null\)/);
});

runTest("client pickers reuse shared pagination controls without inline pagination", () => {
  const sources = [
    readFileSync("src/modules/clients/components/ClientPickerModal.tsx", "utf8"),
    readFileSync("src/modules/parcelamento/components/ParcelamentoClientSelector.tsx", "utf8"),
  ];

  for (const source of sources) {
    assert.match(source, /import \{[^}]*PaginationControls[^}]*\} from "@shared\/components";/);
    assert.match(source, /<PaginationControls[\s\S]*?page=\{page\}[\s\S]*?limit=\{pageSize\}[\s\S]*?total=\{total\}[\s\S]*?count=\{clients\.length\}/);
    assert.match(source, /hasMore=\{Boolean\(clientsQuery\.data\?\.hasMore\) && page < totalPages\}/);
    assert.match(source, /isFetching=\{clientsQuery\.isFetching\}/);
    assert.match(source, /totalPages=\{totalPages\}/);
    assert.match(source, /onFirst=\{\(\) => setPage\(FIRST_CLIENT_PAGE\)\}/);
    assert.match(source, /onLast=\{\(\) => setPage\(totalPages\)\}/);
    assert.match(source, /onPageChange=\{setPage\}/);
    assert.doesNotMatch(source, /Chevron(Left|Right)|handlePageChange|hasPreviousPage|hasNextPage|type="number"/);
  }
});

runTest("client create modal binds person type to document validation and payload", () => {
  const modal = readFileSync("src/modules/clients/components/ClientCreateModal.tsx", "utf8");
  const form = readFileSync("src/modules/clients/components/ClientForm.tsx", "utf8");

  assert.match(modal, /createClientFormInitialValues/);
  assert.match(modal, /setShowDocumentError\(true\)/);
  assert.match(modal, /setShowDocumentError\(false\)/);
  assert.match(modal, /formatCpfCnpjInput/);
  assert.match(modal, /validateCpfCnpjDocument\(formValues\.cpf_cnpj,\s*formValues\.type\)/);
  assert.match(modal, /buildCreateClientPayload\(formValues, organizationId\)/);
  assert.match(modal, /showPersonType/);
  assert.match(modal, /showDocumentError/);
  assert.match(form, /name="type"/);
  assert.match(form, /\(showDocumentError \|\| hasSubmitted\) && values\.cpf_cnpj/);
  assert.match(form, /validateCpfCnpjDocument\(values\.cpf_cnpj,\s*showPersonType \? values\.type : undefined\)/);
  assert.match(form, /error=\{documentError\}/);
  const fieldOrder = [
    'label="Nome"',
    'label="Razão social"',
    ">Tipo de pessoa</span>",
    "label={documentLabel}",
    ">Nome fantasia</span>",
    ">Status</span>",
  ].map((label) => form.indexOf(label));
  assert.ok(fieldOrder.every((position) => position >= 0));
  assert.deepEqual(fieldOrder, [...fieldOrder].sort((left, right) => left - right));
  assert.doesNotMatch(form, /rounded-2xl border border-slate-200 bg-slate-50/);
});

runTest("clients list uses the shared page jump and navigation controls", () => {
  const clients = readFileSync("src/shared/components/newLayout/Clients.tsx", "utf8");

  assert.match(clients, /import \{ DEFAULT_PAGE_SIZE \} from "@shared\/pagination\/pagination";/);
  assert.match(clients, /import \{ PaginationControls \} from "@shared\/components";/);
  assert.match(clients, /const limit = DEFAULT_PAGE_SIZE;/);
  assert.match(clients, /<PaginationControls/);
  assert.match(clients, /totalPages=\{pageCount\}/);
  assert.match(clients, /onPageChange=\{setPage\}/);
  assert.match(clients, /hasMore=\{Boolean\(clientsPage\?\.hasMore\)/);
  assert.doesNotMatch(clients, /pageInputValue|function goToPage/);
});

runTest("clients list hides organization from the main table", () => {
  const clients = readFileSync("src/shared/components/newLayout/Clients.tsx", "utf8");

  assert.doesNotMatch(clients, /<th[^>]*>Organiza\u00e7\u00e3o<\/th>/);
  assert.doesNotMatch(clients, /client\.organization\?\.name/);
  assert.match(clients, /colSpan=\{4\}/);
  assert.doesNotMatch(clients, /colSpan=\{5\}/);
});

runTest("client creation discloses name and document as required", () => {
  const source = readFileSync("src/modules/clients/components/ClientForm.tsx", "utf8");

  assert.match(source, /label="Nome"\s+required/);
  assert.match(source, /label=\{documentLabel\}\s+required/);
  assert.match(source, /name="name"[\s\S]*aria-required/);
  assert.match(source, /name="cpf_cnpj"[\s\S]*aria-required/);
});

runTest("legacy client tabs use toast warnings for validation", () => {
  const regularizeSource = readFileSync(
    "src/components/Forms/ClientTabs/Regularize/DataTab.tsx",
    "utf8",
  );
  const integrationSource = readFileSync(
    "src/components/Forms/ClientTabs/Integracao/DataTab.tsx",
    "utf8",
  );

  assert.match(regularizeSource, /toast\.warn\('Preencha todos os campos'\)/);
  assert.match(integrationSource, /toast\.warn\('Preencha todos os campos'\)/);
  assert.doesNotMatch(regularizeSource, /\balert\(/);
  assert.doesNotMatch(integrationSource, /\balert\(/);
});

runTest("getDocumentIssue flags masked, wrong-length and bad check digit documents", () => {
  assert.equal(getDocumentIssue("529.982.247-25"), null);
  assert.equal(getDocumentIssue("11.222.333/0001-81"), null);
  assert.equal(getDocumentIssue("12.ABC.345/01DE-35"), null);
  assert.equal(getDocumentIssue(""), null);
  assert.equal(getDocumentIssue(null), null);
  assert.equal(getDocumentIssue("\n\t"), null);
  assert.equal(getDocumentIssue("******"), "Documento mascarado");
  assert.equal(getDocumentIssue("3231794528"), "Tamanho inválido");
  assert.equal(getDocumentIssue("529.982.247-26"), "Dígito verificador inválido");
  assert.equal(getDocumentIssue("11.222.333/0001-82"), "Dígito verificador inválido");
  assert.equal(getDocumentIssue("000.000.000-00"), "Dígito verificador inválido");
});

runTest("PA money fields accept only BRL amounts", () => {
  assert.equal(formatPaMoneyInput("123456"), "R$ 123.456");
  assert.equal(formatPaMoneyInput("QA_abc"), "");
  assert.equal(formatPaMoneyInput(""), "");
});

runTest("PA legacy money values are read as reais, not cents", () => {
  assert.equal(parsePaMoneyCents("1500"), 150000);
  assert.equal(parsePaMoneyCents("1500.5"), 150050);
  assert.equal(parsePaMoneyCents("1.500,00"), 150000);
  assert.equal(parsePaMoneyCents("R$ 1.234,56"), 123456);
  assert.equal(parsePaMoneyCents("R$ 12,3"), 1230);
  assert.equal(parsePaMoneyCents("QA_abc"), null);
  assert.equal(parsePaMoneyCents("1.2.3"), null);
  assert.equal(formatPaMoneyFromApi("1500"), "R$ 1.500,00");
  assert.equal(formatPaMoneyFromApi("QA_abc"), "QA_abc");
  assert.equal(formatPaMoneyFromApi(null), "");
});

runTest("PA section relies on mutation invalidation instead of a second GET", () => {
  const source = readFileSync("src/modules/clients/components/ClientPASection.tsx", "utf8");

  assert.doesNotMatch(source, /toast\.success\([^)]*\);\s*await paQuery\.refetch\(\)/);
  assert.match(source, /formatPaMoneyInput/);
});

runTest("history create -> edit -> read keeps the same time in UTC-3", () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "America/Sao_Paulo";

  try {
    const created = toHistoryIsoDate("2026-09-23T10:00");
    assert.equal(created, "2026-09-23T13:00:00.000Z");

    const edited = toHistoryIsoDate(toDatetimeLocalValue(created));
    assert.equal(edited, created);
    assert.equal(toDatetimeLocalValue(edited), "2026-09-23T10:00");
  } finally {
    process.env.TZ = previousTz;
  }
});

runTest("history modal and service share the ISO date helper", () => {
  const modal = readFileSync("src/modules/clients/components/ClientHistoryModal.tsx", "utf8");
  const service = readFileSync("src/modules/clients/services/clientService.ts", "utf8");

  assert.match(modal, /toDatetimeLocalValue/);
  assert.doesNotMatch(modal, /function toDatetimeLocalValue/);
  assert.equal(service.match(/toHistoryIsoDate\(payload\.date\)/g)?.length, 2);
});

runTest("history deletion follows author, admin or owner", () => {
  const history = { user_id: "author" };

  assert.equal(canDeleteClientHistory({ id: "author", permission: 1, type: "user" }, history), true);
  assert.equal(canDeleteClientHistory({ id: "other", permission: 1, type: "user" }, history), false);
  assert.equal(canDeleteClientHistory({ id: "other", permission: 2, type: "user" }, history), true);
  assert.equal(canDeleteClientHistory({ id: "other", permission: null, type: "owner" }, history), true);
  assert.equal(canDeleteClientHistory(null, history), false);
  assert.equal(canManageClientHistories({ id: "o", permission: null, type: "owner" }), true);
  assert.equal(canManageClientHistories({ id: "u", permission: 1, type: "user" }), false);
});

runTest("history modal defaults the date and keeps the file note to edit mode", () => {
  const modal = readFileSync("src/modules/clients/components/ClientHistoryModal.tsx", "utf8");

  assert.match(modal, /date: toDatetimeLocalValue\(new Date\(\)\.toISOString\(\)\)/);
  assert.match(modal, /mode === "edit" \? \(\s*<p[^>]*>\s*Atualização de arquivo não é suportada na edição\./);
});

runTest("integration email is validated before saving", () => {
  assert.equal(getIntegrationEmailError("QA_email_invalido"), "Informe um e-mail válido.");
  assert.equal(getIntegrationEmailError("sem@dominio"), "Informe um e-mail válido.");
  assert.equal(getIntegrationEmailError("contato@acme.com.br"), null);
  assert.equal(getIntegrationEmailError("  "), null);
});

runTest("integration phone warns when letters are dropped", () => {
  assert.equal(getPhoneInputHint("(11) 9abc"), "Telefone aceita apenas números.");
  assert.equal(getPhoneInputHint("(11) 91234-5678"), null);
});

runTest("integration only looks up a CNPJ that differs from the saved one", () => {
  assert.equal(getCnpjToLookup("12.345.678/0001-95", "12345678000195"), "");
  assert.equal(getCnpjToLookup("98.765.432/0001-10", "12345678000195"), "98.765.432/0001-10");
  assert.equal(getCnpjToLookup("98.765.432/0001-10", null), "98.765.432/0001-10");
});

runTest("integration form marks required fields and reserves the CNPJ notice slot", () => {
  const form = readFileSync("src/modules/clients/components/ClientIntegrationForm.tsx", "utf8");

  assert.match(form, /<RequiredFieldLabel[^>]*required>[\s\S]*?Tipo de Pessoa/);
  assert.match(form, /label=\{values\.type === "PJ" \? "CNPJ" : "CPF"\}\s+required/);
  assert.match(form, /label="Nome \/ Apelido"\s+required/);
  assert.match(form, /min-h-12/);
});

runTest("client lifecycle only enables the action valid for the status", () => {
  const none = { canActivate: false, canDeactivate: false, canTerminate: false };

  assert.deepEqual(getClientLifecycleActions("Prospect"), none);
  assert.deepEqual(getClientLifecycleActions("Ativo"), {
    canActivate: false,
    canDeactivate: true,
    canTerminate: true,
  });
  assert.deepEqual(getClientLifecycleActions("Inativo"), { ...none, canActivate: true });
  assert.deepEqual(getClientLifecycleActions("Processo de Inativação"), { ...none, canActivate: true });
  assert.deepEqual(getClientLifecycleActions("Paralisado"), { ...none, canActivate: true });
  assert.deepEqual(getClientLifecycleActions("Não Contratado"), none);
  assert.deepEqual(getClientLifecycleActions(""), none);
});

runTest("client lifecycle asks for confirmation and termination marks required fields", () => {
  const detail = readFileSync("src/pages/clients/[id].tsx", "utf8");
  const termination = readFileSync("src/modules/clients/components/ClientTerminationForm.tsx", "utf8");

  assert.match(detail, /<ConfirmationDialog/);
  assert.match(detail, /client\.name/);
  assert.doesNotMatch(detail, /onClick=\{\(\) => void handleDeactivate\(\)\}/);
  assert.equal(termination.match(/<RequiredFieldLabel[^>]*required>/g)?.length, 3);
});

runTest("clients, regularize and fiscal share one tax regime list", () => {
  assert.deepEqual(getRegularizeRegimeOptions(""), [...CLIENT_TAX_REGIME_OPTIONS]);
  assert.deepEqual(
    FISCAL_TAX_REGIME_OPTIONS.map((option) => option.label),
    [...CLIENT_TAX_REGIME_OPTIONS],
  );
  assert.deepEqual(
    FISCAL_TAX_REGIME_OPTIONS.map((option) => option.value),
    ["0", "1", "2"],
  );
});

runTest("regularize keeps a legacy regime visible instead of dropping it", () => {
  assert.deepEqual(getRegularizeRegimeOptions(""), [...CLIENT_TAX_REGIME_OPTIONS]);
  assert.deepEqual(getRegularizeRegimeOptions("Lucro Real"), [...CLIENT_TAX_REGIME_OPTIONS]);
  assert.deepEqual(getRegularizeRegimeOptions("E-SOCIAL"), [...CLIENT_TAX_REGIME_OPTIONS, "E-SOCIAL"]);

  for (const path of [
    "src/components/Tabs/Client/Regularize.tsx",
    "src/components/Forms/ClientTabs/Regularize/DataTab.tsx",
  ]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /CAEPF|E-SOCIAL/);
  }
});
