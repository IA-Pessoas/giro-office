import { readZipEntries } from "@workspace/shared/testUtils";
import { describe, expect, it, vi } from "vitest";

import * as pdfService from "../services/simplesRatePdfService.js";
import type { SimplesRateBatch, SimplesRateEmission } from "../services/simplesRateService.js";
import { simplesRateZipExport } from "../services/simplesRateZipService.js";

function emission(
  client_id: string,
  client_name: string,
  rate: string,
  client_document = "12.345.678/0001-90",
): SimplesRateEmission {
  return {
    client_id,
    client_name,
    client_document,
    competence: "2026-08",
    applies_to: "2026-09",
    annex: "III",
    tax: "ISS",
    rate,
  };
}

function batch(included: SimplesRateEmission[]): SimplesRateBatch {
  return {
    competence: "2026-08",
    applies_to: "2026-09",
    annex: "III",
    tax: "ISS",
    included,
    skipped: [
      {
        document: "99999999000199",
        client_name: null,
        reason: "Cliente não encontrado nesta organização.",
      },
    ],
  };
}

// Texto dos operadores de texto do PDF sem compressão (hex WinAnsi).
function pdfText(pdf: Buffer): string {
  return [...pdf.toString("latin1").matchAll(/<([0-9a-f]+)>/gi)]
    .map((match) => Buffer.from(match[1], "hex").toString("latin1"))
    .join("");
}

describe("simplesRateZipExport", () => {
  it("reúne um PDF por cliente incluído, com a alíquota final de cada um", async () => {
    const result = await simplesRateZipExport(
      batch([
        emission("c1", "Salão Bela Vista Ltda", "2.01"),
        emission("c2", "Clínica Vida Ltda", "5.00", "23.456.789/0001-01"),
      ]),
    );

    expect(result.file_name).toBe("aliquotas-ISS-anexo-III-2026-09.zip");
    expect(result.skipped).toHaveLength(1);
    const entries = readZipEntries(Buffer.from(result.zip_base64 ?? "", "base64"));
    expect([...entries.keys()]).toEqual([
      "aliquota-ISS-anexo-III-2026-09-salao-bela-vista-ltda-12345678000190.pdf",
      "aliquota-ISS-anexo-III-2026-09-clinica-vida-ltda-23456789000101.pdf",
    ]);
    // O ignorado do lote não vira PDF.
    expect(entries.size).toBe(2);
    expect([...entries.keys()].some((name) => name.includes("99999999000199"))).toBe(false);
    const first = pdfText(
      entries.get("aliquota-ISS-anexo-III-2026-09-salao-bela-vista-ltda-12345678000190.pdf") ??
        Buffer.alloc(0),
    );
    expect(first).toContain("Salão Bela Vista Ltda - 12.345.678/0001-90");
    expect(first).toContain("(Simples Nacional, Anexo III) referente ao mês de 09/2026 é de");
    expect(first).toContain("2,01%");
    expect(
      pdfText(
        entries.get("aliquota-ISS-anexo-III-2026-09-clinica-vida-ltda-23456789000101.pdf") ??
          Buffer.alloc(0),
      ),
    ).toContain("5,00%");
  });

  it("sem incluídos não gera arquivo, mas devolve os ignorados", async () => {
    const result = await simplesRateZipExport(batch([]));

    expect(result.zip_base64).toBeNull();
    expect(result.skipped[0]?.reason).toBe("Cliente não encontrado nesta organização.");
  });

  it("falha inteira quando um PDF não é gerado, sem ZIP parcial", async () => {
    const spy = vi
      .spyOn(pdfService, "renderSimplesRatePdf")
      .mockResolvedValueOnce(Buffer.from("%PDF ok"))
      .mockRejectedValueOnce(new Error("pdfkit falhou"));

    await expect(
      simplesRateZipExport(batch([emission("c1", "A", "2.01"), emission("c2", "B", "3.00")])),
    ).rejects.toMatchObject({
      statusCode: 500,
      expose: true,
      message: expect.stringMatching(/nenhum arquivo/),
    });
    spy.mockRestore();
  });
});
