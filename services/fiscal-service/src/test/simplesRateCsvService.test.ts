import { describe, expect, it } from "vitest";

import { renderSimplesRateCsv, simplesRateCsvFileName } from "../services/simplesRateCsvService.js";
import type { SimplesRateBatch } from "../services/simplesRateService.js";

const batch: SimplesRateBatch = {
  competence: "2026-08",
  applies_to: "2026-09",
  annex: "III",
  tax: "ISS",
  included: [
    {
      client_id: "c1",
      client_name: 'Padaria; Doces "Finos" Ltda',
      client_document: "12.345.678/0001-90",
      competence: "2026-08",
      applies_to: "2026-09",
      annex: "III",
      tax: "ISS",
      rate: "2.01",
    },
    {
      client_id: "c2",
      client_name: '=HYPERLINK("http://x")',
      client_document: "444.444.444-44",
      competence: "2026-08",
      applies_to: "2026-09",
      annex: "III",
      tax: "ISS",
      rate: "5.00",
    },
  ],
  skipped: [
    {
      document: "99999999000199",
      client_name: null,
      reason: "Cliente não encontrado nesta organização.",
    },
  ],
};

describe("renderSimplesRateCsv", () => {
  it("gera razão social;CPF/CNPJ;% com vírgula decimal, sem os ignorados", () => {
    const lines = renderSimplesRateCsv(batch).split("\r\n");

    expect(lines[0]).toBe("﻿Razão Social;CPF/CNPJ;%");
    expect(lines[1]).toBe('"Padaria; Doces ""Finos"" Ltda";12.345.678/0001-90;2,01');
    // Fórmula neutralizada com apóstrofo (e citada por conter aspas).
    expect(lines[2]).toBe('"\'=HYPERLINK(""http://x"")";444.444.444-44;5,00');
    expect(lines).toHaveLength(4); // cabeçalho, 2 linhas e a quebra final
    expect(renderSimplesRateCsv(batch)).not.toContain("99999999000199");
  });

  it("nomeia o arquivo pelo tributo, anexo e mês da alíquota", () => {
    expect(simplesRateCsvFileName(batch)).toBe("aliquotas-ISS-anexo-III-2026-09.csv");
  });
});
