import assert from "node:assert/strict";
import test from "node:test";

import {
  filterContabilTriagePortfolio,
  filterFiscalTriagePortfolio,
  fiscalTriagePortfolioFiltersFromQuery,
} from "../../src/triagem/triagePortfolioFilters.ts";

const rows = [
  {
    legal_name: "Alfa Ltda",
    cpf_cnpj: "111",
    regime: "Simples Nacional",
    responsible_id: "u1",
    planned_checklist: { outbound_report: "PENDING" },
    monthly: {
      checklist: { outbound_report: "NOT_PRESENT" },
      item_notes: { outbound_report: { note: null, justification: "Sem movimento" } },
    },
  },
  {
    legal_name: "Beta SA",
    cpf_cnpj: "222",
    regime: null,
    responsible_id: null,
    planned_checklist: { outbound_report: "PENDING" },
    monthly: null,
  },
  {
    legal_name: "Gama ME",
    cpf_cnpj: "333",
    regime: "Lucro Presumido",
    responsible_id: "u2",
    planned_checklist: null,
    monthly: { checklist: { outbound_report: "COMPLETED" }, item_notes: {} },
  },
];

const names = (filtered: typeof rows) => filtered.map((row) => row.legal_name);

test("sem filtros devolve todo o conjunto", () => {
  assert.deepEqual(names(filterFiscalTriagePortfolio(rows, {})), [
    "Alfa Ltda",
    "Beta SA",
    "Gama ME",
  ]);
});

test("filtra por busca, responsável, regime e estado do item", () => {
  assert.deepEqual(names(filterFiscalTriagePortfolio(rows, { search: "beta" })), ["Beta SA"]);
  assert.deepEqual(names(filterFiscalTriagePortfolio(rows, { responsibleId: "u2" })), ["Gama ME"]);
  assert.deepEqual(names(filterFiscalTriagePortfolio(rows, { responsibleId: "none" })), [
    "Beta SA",
  ]);
  assert.deepEqual(names(filterFiscalTriagePortfolio(rows, { regime: "Não informado" })), [
    "Beta SA",
  ]);
  assert.deepEqual(
    names(
      filterFiscalTriagePortfolio(rows, {
        documentField: "outbound_report",
        documentStatus: "PENDING",
      }),
    ),
    ["Beta SA"],
  );
  assert.deepEqual(
    names(
      filterFiscalTriagePortfolio(rows, {
        documentField: "inbound_report",
        documentStatus: "NOT_STARTED",
      }),
    ),
    ["Alfa Ltda", "Beta SA", "Gama ME"],
  );
});

test("justificativa vale para a empresa, qualquer que seja a coluna filtrada", () => {
  assert.deepEqual(
    names(
      filterFiscalTriagePortfolio(rows, { documentField: "inbound_report", justification: "with" }),
    ),
    ["Alfa Ltda"],
  );
  assert.deepEqual(names(filterFiscalTriagePortfolio(rows, { justification: "with" })), [
    "Alfa Ltda",
  ]);
  assert.deepEqual(names(filterFiscalTriagePortfolio(rows, { justification: "without" })), [
    "Beta SA",
    "Gama ME",
  ]);
});

test("filtra por prioridade Sim/Não e meio de envio do cliente (#1692)", () => {
  const clients = [
    { ...rows[0], priority: true, delivery_method: "EMAIL" },
    { ...rows[1], priority: false, delivery_method: null },
    { ...rows[2] },
  ];
  assert.deepEqual(names(filterFiscalTriagePortfolio(clients, { priority: "yes" })), ["Alfa Ltda"]);
  assert.deepEqual(names(filterFiscalTriagePortfolio(clients, { priority: "no" })), [
    "Beta SA",
    "Gama ME",
  ]);
  assert.deepEqual(names(filterFiscalTriagePortfolio(clients, { deliveryMethod: "EMAIL" })), [
    "Alfa Ltda",
  ]);
  assert.deepEqual(names(filterFiscalTriagePortfolio(clients, { deliveryMethod: "none" })), [
    "Beta SA",
    "Gama ME",
  ]);
});

test("converte a query validada nos filtros da tela", () => {
  assert.deepEqual(
    fiscalTriagePortfolioFiltersFromQuery({
      responsible_id: "u1",
      document_field: "outbound_report",
      document_status: "PENDING",
      justification: "with",
      priority: "yes",
      delivery_method: "EMAIL",
    }),
    {
      search: undefined,
      responsibleId: "u1",
      regime: undefined,
      documentField: "outbound_report",
      documentStatus: "PENDING",
      justification: "with",
      priority: "yes",
      deliveryMethod: "EMAIL",
    },
  );
});

test("filtra a carteira contábil por responsável, regime e fechamento", () => {
  const contabil = [
    {
      id: "a",
      regime: "Simples Nacional",
      person_responsible_id: "u1",
      closing: { status: "CLOSED" },
    },
    { id: "b", regime: "", person_responsible_id: null, closing: { status: "NOT_RECEIVED" } },
  ];
  const ids = (filters: Parameters<typeof filterContabilTriagePortfolio>[1]) =>
    filterContabilTriagePortfolio(contabil, filters).map((row) => row.id);
  assert.deepEqual(ids({}), ["a", "b"]);
  assert.deepEqual(ids({ responsibleId: "none", regime: "Não informado" }), ["b"]);
  assert.deepEqual(ids({ responsibleId: "u1", closingStatus: "CLOSED" }), ["a"]);
  assert.deepEqual(ids({ closingStatus: "RECEIVED" }), []);
});
