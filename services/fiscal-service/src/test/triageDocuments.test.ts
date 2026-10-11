import { describe, expect, it } from "vitest";

import { hasTriagePendency, triageDocumentsView } from "../services/triageDocuments.js";

describe("triageDocumentsView", () => {
  it("conta como pendente só PENDING, ATTENTION e UNDER_REVIEW do checklist mensal", () => {
    const view = triageDocumentsView(
      {
        checklist: {
          inbound_report: "COMPLETED",
          outbound_report: "PENDING",
          nfse_provided: "ATTENTION",
          nfse_received: "UNDER_REVIEW",
          cte_documents: "NOT_PRESENT",
          mei_documents: "NOT_APPLICABLE",
          billing_amount: "123,00",
          bank_statement: "PENDING",
        },
      },
      undefined,
    );

    expect(view.source).toBe("MONTHLY");
    expect(view.pending).toBe(3);
    expect(view.items).toEqual([
      { field: "inbound_report", status: "COMPLETED" },
      { field: "outbound_report", status: "PENDING" },
      { field: "nfse_provided", status: "ATTENTION" },
      { field: "nfse_received", status: "UNDER_REVIEW" },
      { field: "cte_documents", status: "NOT_PRESENT" },
      { field: "mei_documents", status: "NOT_APPLICABLE" },
    ]);
    expect(hasTriagePendency(view)).toBe(true);
  });

  it("lê os estados do legado com o mesmo mapeamento da Triagem (#1693)", () => {
    const view = triageDocumentsView(
      {
        checklist: {
          sped_fiscal: "concluido",
          nfce_documents: "",
          model_21_invoice: "nao possui",
          cte_as_issuer: "atenção",
          services_provided_as_mei: "desconhecido",
        },
      },
      undefined,
    );

    expect(view.items).toEqual([
      { field: "sped_fiscal", status: "COMPLETED" },
      { field: "nfce_documents", status: "PENDING" },
      { field: "model_21_invoice", status: "NOT_PRESENT" },
      { field: "cte_as_issuer", status: "ATTENTION" },
    ]);
    expect(view.pending).toBe(2);
  });

  it("sem rotina mensal, os itens obrigatórios planejados na competência estão pendentes", () => {
    const view = triageDocumentsView(undefined, {
      configuration_snapshot: {
        configs: [
          { type: "CONTABIL", active_items: ["bank_statement"] },
          {
            type: "FISCAL",
            active_items: [
              "inbound_report",
              { field: "sped_fiscal", required: false },
              { field: "nfse_provided" },
            ],
          },
        ],
      },
    });

    expect(view).toEqual({
      source: "PLANNED",
      pending: 2,
      items: [
        { field: "inbound_report", status: "PENDING" },
        { field: "nfse_provided", status: "PENDING" },
      ],
    });
  });

  it("checklist todo resolvido não tem pendência", () => {
    const view = triageDocumentsView(
      { checklist: { inbound_report: "COMPLETED", outbound_report: "NOT_PRESENT" } },
      { configuration_snapshot: { configs: [{ type: "FISCAL", active_items: ["sped_fiscal"] }] } },
    );
    expect(view.pending).toBe(0);
    expect(hasTriagePendency(view)).toBe(false);
  });

  it("sem registro na Triagem não confirma documentos: conta como pendência", () => {
    const view = triageDocumentsView(undefined, undefined);
    expect(view).toEqual({ source: "NONE", pending: null, items: [] });
    expect(hasTriagePendency(view)).toBe(true);
  });
});
