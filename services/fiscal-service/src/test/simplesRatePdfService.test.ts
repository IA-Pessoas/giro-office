import { describe, expect, it } from "vitest";

import { renderSimplesRatePdf, simplesRatePdfHeaders } from "../services/simplesRatePdfService.js";
import type { SimplesRateEmission } from "../services/simplesRateService.js";

// Texto dos operadores TJ/Tj (pdfkit sem compressão escreve cada trecho em hex WinAnsi).
function pdfText(pdf: Buffer): string {
  const content = pdf.toString("latin1");
  return [...content.matchAll(/<([0-9a-f]+)>/gi)]
    .map((match) => Buffer.from(match[1], "hex").toString("latin1"))
    .join("");
}

const emission: SimplesRateEmission = {
  client_id: "d0000000-0000-4000-8000-000000000001",
  client_name: "Padaria Exemplo Ltda",
  client_document: "12.345.678/0001-90",
  competence: "2026-12",
  applies_to: "2027-01",
  annex: "III",
  tax: "ISS",
  rate: "2.01",
};

describe("renderSimplesRatePdf", () => {
  it("escreve a carta do legado com cliente, mês seguinte, tributo e alíquota final", async () => {
    const pdf = await renderSimplesRatePdf(emission);
    const text = pdfText(pdf);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(text).toContain("Prezado cliente,");
    expect(text).toContain("Padaria Exemplo Ltda - 12.345.678/0001-90");
    expect(text).toContain("Alíquota de ISS");
    expect(text).toContain("(Simples Nacional, Anexo III) referente ao mês de 01/2027 é de");
    expect(text).toContain("2,01%");
    expect(text).toContain("notas fiscais de serviços eletrônicas");
    expect(text).toContain("01/01/2027");
  });

  it("usa o texto de ICMS para os Anexos I e II", async () => {
    const text = pdfText(
      await renderSimplesRatePdf({ ...emission, annex: "I", tax: "ICMS", rate: "1.36" }),
    );

    expect(text).toContain("Alíquota de ICMS");
    expect(text).toContain("Anexo I)");
    expect(text).toContain("1,36%");
    expect(text).toContain("emissão de notas fiscais eletrônicas");
  });

  it("baixa sem cache com nome do tributo e do mês de referência", () => {
    expect(simplesRatePdfHeaders(emission)).toEqual({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="aliquota-ISS-anexo-III-2027-01-${emission.client_id}.pdf"`,
      "Cache-Control": "no-store",
    });
  });
});
