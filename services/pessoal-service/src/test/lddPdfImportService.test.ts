import { describe, expect, it } from "vitest";

import {
  buildLddImportPreview,
  LDD_PDF_MAX_BYTES,
  parseLddText,
} from "../services/lddPdfImportService.js";
import { lddPdfBase64, SIEF_MARKER } from "./lddPdfFixtures.js";

describe("parseLddText", () => {
  it("extrai competência, vencimento e o segundo valor das linhas CP-", () => {
    const rows = parseLddText([
      [
        "Pendência - Débito (SIEF)",
        "CP-SEGUR. 01/2024 20/02/2024 1.500,00 1.234,56 DEVEDOR",
        "CP-PATRONAL 13/2023 20/12/2023 80,00 75,10 DEVEDOR",
      ].join("\n"),
    ]);

    expect(rows).toEqual([
      {
        line: 1,
        source: "CP-SEGUR. 01/2024 20/02/2024 1.500,00 1.234,56 DEVEDOR",
        period: "01/2024",
        due_date: "2024-02-20",
        balance_amount: 1234.56,
        errors: [],
      },
      {
        line: 2,
        source: "CP-PATRONAL 13/2023 20/12/2023 80,00 75,10 DEVEDOR",
        period: "13/2023",
        due_date: "2023-12-20",
        balance_amount: 75.1,
        errors: [],
      },
    ]);
  });

  it("para no limite SIEF, mesmo quando ele está em outra página", () => {
    const rows = parseLddText([
      "CP-SEGUR. 01/2024 20/02/2024 10,00 10,00",
      `${SIEF_MARKER}\nCP-SEGUR. 02/2024 20/03/2024 99,00 99,00`,
      "CP-SEGUR. 03/2024 20/04/2024 99,00 99,00",
    ]);

    expect(rows.map((row) => row.period)).toEqual(["01/2024"]);
  });

  it("mantém duas linhas distintas com a mesma competência e vencimento", () => {
    const rows = parseLddText([
      "CP-SEGUR. 01/2024 20/02/2024 10,00 10,00\nCP-TERC. 01/2024 20/02/2024 5,00 5,00",
    ]);

    expect(rows.map((row) => row.balance_amount)).toEqual([10, 5]);
  });

  it("aponta o campo ilegível da linha sem descartá-la", () => {
    const [missingValue, missingDates, invalidDate] = parseLddText([
      [
        "CP-SEGUR. 01/2024 20/02/2024 10,00",
        "CP-SEGUR. 10,00 10,00",
        "CP-SEGUR. 02/2024 31/02/2024 10,00 10,00",
      ].join("\n"),
    ]);

    expect(missingValue).toMatchObject({
      period: "01/2024",
      due_date: "2024-02-20",
      balance_amount: null,
      errors: ["Valor não identificado na linha."],
    });
    expect(missingDates).toMatchObject({
      period: null,
      due_date: null,
      balance_amount: 10,
      errors: ["Competência não identificada na linha.", "Vencimento não identificado na linha."],
    });
    expect(invalidDate).toMatchObject({
      period: "02/2024",
      due_date: null,
      errors: ["Vencimento não identificado na linha."],
    });
  });
});

describe("buildLddImportPreview", () => {
  it("monta a prévia a partir do PDF", () => {
    const preview = buildLddImportPreview({
      file_name: "ldd.pdf",
      content_base64: lddPdfBase64([
        "CP-SEGUR. 01/2024 20/02/2024 1.500,00 1.234,56",
        SIEF_MARKER,
        "CP-SEGUR. 02/2024 20/03/2024 99,00 99,00",
      ]),
    });

    expect(preview).toEqual({
      file_name: "ldd.pdf",
      rows: [
        {
          line: 1,
          source: "CP-SEGUR. 01/2024 20/02/2024 1.500,00 1.234,56",
          period: "01/2024",
          due_date: "2024-02-20",
          balance_amount: 1234.56,
          errors: [],
        },
      ],
    });
  });

  it("recusa arquivo que não é PDF, ilegível, sem linha elegível ou acima do limite", () => {
    const cases: [string, number, RegExp][] = [
      [Buffer.from("planilha").toString("base64"), 422, /não é PDF/],
      [
        Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n").toString("base64"),
        422,
        /sem páginas legíveis/,
      ],
      [lddPdfBase64(["Relatório de situação fiscal", "Nada consta"]), 422, /Nenhuma linha CP-/],
      [
        lddPdfBase64([SIEF_MARKER, "CP-SEGUR. 02/2024 20/03/2024 99,00 99,00"]),
        422,
        /Nenhuma linha CP-/,
      ],
      [Buffer.alloc(LDD_PDF_MAX_BYTES + 1, 0x20).toString("base64"), 413, /limite de 700 KB/],
    ];

    for (const [content_base64, statusCode, message] of cases) {
      let thrown: unknown;
      try {
        buildLddImportPreview({ file_name: "x.pdf", content_base64 });
      } catch (err: unknown) {
        thrown = err;
      }
      expect(thrown).toMatchObject({ statusCode, message: expect.stringMatching(message) });
    }
  });
});
