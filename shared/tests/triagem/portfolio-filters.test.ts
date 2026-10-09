import assert from "node:assert/strict";
import test from "node:test";

import {
  filterFiscalTriagePortfolio,
  parseFiscalTriagePortfolioFilters,
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

test("filtra por justificativa no item ou em qualquer item", () => {
  assert.deepEqual(
    names(
      filterFiscalTriagePortfolio(rows, {
        documentField: "outbound_report",
        justification: "with",
      }),
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

test("lê os filtros da query string e rejeita valores inválidos", () => {
  assert.deepEqual(
    parseFiscalTriagePortfolioFilters({
      search: " alfa ",
      responsible_id: "u1",
      regime: "Simples Nacional",
      document_field: "outbound_report",
      document_status: "PENDING",
      justification: "with",
    }),
    {
      search: "alfa",
      responsibleId: "u1",
      regime: "Simples Nacional",
      documentField: "outbound_report",
      documentStatus: "PENDING",
      justification: "with",
    },
  );
  assert.deepEqual(parseFiscalTriagePortfolioFilters({}), {});
  assert.throws(() => parseFiscalTriagePortfolioFilters({ document_field: "x" }), /document_field/);
  assert.throws(
    () => parseFiscalTriagePortfolioFilters({ document_status: "x" }),
    /document_status/,
  );
  assert.throws(() => parseFiscalTriagePortfolioFilters({ justification: "x" }), /justification/);
});
