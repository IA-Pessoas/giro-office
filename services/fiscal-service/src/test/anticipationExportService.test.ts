import { describe, expect, it } from "vitest";

import {
  type AnticipationDemonstrative,
  anticipationDemonstrativeHeaders,
  renderAnticipationCsv,
  renderAnticipationPdf,
} from "../services/anticipationExportService.js";

// Texto dos operadores TJ/Tj (pdfkit sem compressão escreve cada trecho em hex WinAnsi).
function pdfText(pdf: Buffer): string {
  const content = pdf.toString("latin1");
  return [...content.matchAll(/<([0-9a-f]+)>/gi)]
    .map((match) => Buffer.from(match[1] as string, "hex").toString("latin1"))
    .join("");
}

const responsibleId = "c0000000-0000-4000-8000-000000000001";
const reviewerId = "c0000000-0000-4000-8000-000000000002";
const key = "35261011222333000181550010000001001000000019";

const item = {
  id: "e0000000-0000-4000-8000-000000000001",
  entry: "100.xml",
  access_key: key,
  issuer: "11222333000181",
  model: "55",
  series: "1",
  note_number: "100",
  item_number: 1,
  code: "P1",
  description: "Cerveja lata",
  ncm: "22030000",
  cfop: "6102",
  quantity: "2",
  value: "10.00",
  ipi: null,
  icms_st: "1.50",
  classification: "partial" as const,
  manual_value: "7.50",
  corrections: { ncm: "22029900", value: "9.90" },
};

const demonstrative: AnticipationDemonstrative = {
  batch: {
    id: "b0000000-0000-4000-8000-000000000001",
    client_id: "d0000000-0000-4000-8000-000000000001",
    competence: "2026-09",
    file_name: "notas.zip",
    status: "checked",
    responsible_id: responsibleId,
    reviewer_id: reviewerId,
    entry_count: 2,
    note_count: 2,
    item_count: 2,
    issues: [],
    created_by: responsibleId,
    createdAt: "2026-10-09T12:00:00.000Z",
    updatedAt: "2026-10-09T13:00:00.000Z",
    items: [
      item,
      {
        ...item,
        id: "e0000000-0000-4000-8000-000000000002",
        note_number: "101",
        description: "Cerveja; lata",
        classification: null,
        manual_value: null,
        corrections: {},
      },
    ],
    history: [],
  },
  client: { name: "Padaria Exemplo Ltda", document: "12.345.678/0001-90" },
  people: { [responsibleId]: "Ana Responsável", [reviewerId]: "Bruno Conferente" },
};

const DECLARATION =
  "Demonstrativo manual: não houve apuração automática de imposto nem emissão de guia oficial.";

describe("renderAnticipationCsv", () => {
  const csv = renderAnticipationCsv(demonstrative);
  const lines = csv.replace(/^﻿/u, "").trimEnd().split("\r\n");

  it("identifica lote, cliente, revisão e declara que não houve apuração nem guia", () => {
    expect(lines.slice(0, 7)).toEqual([
      "Demonstrativo manual de antecipações",
      `Declaração;${DECLARATION}`,
      "Cliente;Padaria Exemplo Ltda;12.345.678/0001-90",
      "Competência;09/2026",
      "Lote;notas.zip;b0000000-0000-4000-8000-000000000001",
      "Estado da revisão;Conferido",
      "Responsável;Ana Responsável;Conferente;Bruno Conferente",
    ]);
  });

  it("separa valor final, origem e valor do XML em cada campo, e o valor informado", () => {
    const header = lines[8]?.split(";");
    const first = Object.fromEntries(
      (header ?? []).map((name, index) => [name, lines[9]?.split(";")[index]]),
    );
    expect(first).toMatchObject({
      Nota: "100",
      Item: "1",
      "Chave de acesso": key,
      Arquivo: "100.xml",
      Classificação: "Parcial",
      NCM: "22029900",
      "NCM - origem": "Corrigido",
      "NCM - XML": "22030000",
      CFOP: "6102",
      "CFOP - origem": "XML",
      Valor: "9,90",
      "Valor - origem": "Corrigido",
      "Valor - XML": "10,00",
      IPI: "",
      "IPI - origem": "XML",
      "Valor informado": "7,50",
      "Valor informado - origem": "Informado manualmente",
    });
    expect(lines[10]).toContain('"Cerveja; lata"');
    expect(lines[10]).toContain(";Sem classificação;");
    expect(lines).toHaveLength(11);
  });
});

describe("renderAnticipationPdf", () => {
  it("traz os mesmos itens com a origem de cada valor e a declaração", async () => {
    const pdf = await renderAnticipationPdf(demonstrative);
    const text = pdfText(pdf);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(text).toContain("Demonstrativo manual de antecipações");
    expect(text).toContain(DECLARATION);
    expect(text).toContain("Padaria Exemplo Ltda - 12.345.678/0001-90");
    expect(text).toContain("Competência 09/2026");
    expect(text).toContain("Conferido");
    expect(text).toContain("Bruno Conferente");
    expect(text).toContain("NF 100 série 1 item 1");
    expect(text).toContain("Parcial");
    expect(text).toContain("NCM 22029900 (corrigido; XML 22030000)");
    expect(text).toContain("Valor R$ 9,90 (corrigido; XML R$ 10,00)");
    expect(text).toContain("ICMS ST R$ 1,50 (XML)");
    expect(text).toContain("Valor informado R$ 7,50 (informado manualmente)");
    expect(text).toContain("NF 101 série 1 item 1");
    expect(text).toContain("Sem classificação");
  });

  it("baixa com nome identificável e sem cache", () => {
    expect(anticipationDemonstrativeHeaders(demonstrative, "pdf")).toEqual({
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'attachment; filename="antecipacoes-2026-09-b0000000-0000-4000-8000-000000000001.pdf"',
      "Cache-Control": "no-store",
    });
    expect(anticipationDemonstrativeHeaders(demonstrative, "csv")["Content-Type"]).toBe(
      "text/csv; charset=utf-8",
    );
  });
});
