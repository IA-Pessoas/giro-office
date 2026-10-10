import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  buildLddImportPreview,
  confirmLddImport,
  LDD_IMPORT_TYPE,
  lddRowsFromPdfText,
  parseLddText,
  SIEF_LIMIT as SIEF_MARKER,
} from "../services/lddPdfImportService.js";
import { lddPdf, lddPdfBase64 } from "./lddPdfFixtures.js";
import { clientId, organizationId, recordId, userId } from "./pessoalCoreTestUtils.js";

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

  it("junta as células quando o PDF traz uma por linha de texto", () => {
    const rows = parseLddText([
      [
        "CP-SEGUR.",
        "01/2024",
        "20/02/2024",
        "1.500,00",
        "1.234,56",
        "CP-TERC. 02/2024 20/03/2024 5,00 5,00",
        "Total 99,00 99,00",
      ].join("\n"),
    ]);

    expect(rows).toEqual([
      {
        line: 1,
        source: "CP-SEGUR. 01/2024 20/02/2024 1.500,00 1.234,56",
        period: "01/2024",
        due_date: "2024-02-20",
        balance_amount: 1234.56,
        errors: [],
      },
      expect.objectContaining({ line: 2, period: "02/2024", balance_amount: 5, errors: [] }),
    ]);
  });

  it("não puxa dados da linha CP- seguinte para completar a anterior", () => {
    const [incomplete, complete] = parseLddText([
      "CP-SEGUR. 01/2024\nCP-TERC. 02/2024 20/03/2024 5,00 5,00",
    ]);

    expect(incomplete).toMatchObject({ source: "CP-SEGUR. 01/2024", due_date: null });
    expect(complete).toMatchObject({ period: "02/2024", errors: [] });
  });

  it("ignora MM/AAAA com mês inválido e usa a competência seguinte da linha", () => {
    const [row] = parseLddText(["CP-SEGUR. 99/2024 01/2024 20/02/2024 10,00 10,00"]);

    expect(row).toMatchObject({ period: "01/2024", errors: [] });
  });

  it("marca valor zerado como erro da linha", () => {
    const [row] = parseLddText(["CP-SEGUR. 01/2024 20/02/2024 10,00 0,00"]);

    expect(row).toMatchObject({ balance_amount: 0, errors: ["Valor zerado na linha."] });
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
    const lines = [
      "CP-SEGUR. 01/2024 20/02/2024 1.500,00 1.234,56",
      SIEF_MARKER,
      "CP-SEGUR. 02/2024 20/03/2024 99,00 99,00",
    ];
    const preview = buildLddImportPreview({
      file_name: "ldd.pdf",
      content_base64: lddPdfBase64(lines),
    });

    expect(preview).toEqual({
      file_name: "ldd.pdf",
      file_hash: createHash("sha256").update(lddPdf(lines)).digest("hex"),
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

  it("recusa arquivo que não é PDF, ilegível ou sem linha elegível", () => {
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

  it("recusa página ilegível só quando ela vem antes do limite SIEF", () => {
    const line = "CP-SEGUR. 01/2024 20/02/2024 10,00 10,00";

    expect(lddRowsFromPdfText([line, SIEF_MARKER, ""], [3])).toHaveLength(1);
    for (const pages of [
      [line, "", SIEF_MARKER],
      [line, ""],
    ]) {
      expect(() => lddRowsFromPdfText(pages, [2])).toThrow(/Página\(s\) 2 sem texto legível/);
    }
  });
});

describe("confirmLddImport", () => {
  const context = { organizationId, userId, permission: 2 };
  const fileHash = "a".repeat(64);
  const body = (rows: { period: string; due_date: string; balance_amount: number }[]) => ({
    client_id: clientId,
    file_name: "ldd.pdf",
    file_hash: fileHash,
    rows,
  });

  function createStore() {
    return {
      lddImportPessoal: {
        findFirst: vi.fn(async (): Promise<{ created_at: Date } | null> => null),
        create: vi.fn(async ({ data }) => ({ id: "import-1", ...data })),
      },
      lddPessoal: {
        findFirst: vi.fn(
          async (): Promise<{ id: string; balance_amount: number | null } | null> => null,
        ),
        create: vi.fn(async ({ data }) => ({ id: recordId, ...data })),
        update: vi.fn(async ({ where, data }) => ({ ...where, ...data })),
      },
    };
  }

  it("soma linhas da mesma chave e grava um LDD previdenciário por chave", async () => {
    const store = createStore();

    const result = await confirmLddImport(
      store,
      context,
      body([
        { period: "01/2024", due_date: "2024-02-20", balance_amount: 0.1 },
        { period: "01/2024", due_date: "2024-02-20", balance_amount: 0.2 },
        { period: "02/2024", due_date: "2024-03-20", balance_amount: 5 },
      ]),
    );

    expect(store.lddImportPessoal.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        client_id: clientId,
        file_hash: fileHash,
        file_name: "ldd.pdf",
        rows_count: 3,
        total_amount: 5.3,
        imported_by_id: userId,
      },
    });
    expect(store.lddPessoal.create).toHaveBeenCalledTimes(2);
    expect(store.lddPessoal.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: {
          organization_id: organizationId,
          client_id: clientId,
          type: LDD_IMPORT_TYPE,
          period: "01/2024",
          due_date: new Date("2024-02-20T00:00:00.000Z"),
          balance_amount: 0.3,
        },
      }),
    );
    expect(result).toMatchObject({ import_id: "import-1", rows_count: 3, total_amount: 5.3 });
    expect(result.records).toHaveLength(2);
  });

  it("acrescenta ao saldo já cadastrado da mesma chave, só na organização do contexto", async () => {
    const store = createStore();
    store.lddPessoal.findFirst.mockResolvedValueOnce({ id: recordId, balance_amount: 100.1 });

    await confirmLddImport(
      store,
      context,
      body([{ period: "01/2024", due_date: "2024-02-20", balance_amount: 0.2 }]),
    );

    expect(store.lddPessoal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: organizationId,
          client_id: clientId,
          type: LDD_IMPORT_TYPE,
          period: "01/2024",
          due_date: {
            gte: new Date("2024-02-20T00:00:00.000Z"),
            lt: new Date("2024-02-21T00:00:00.000Z"),
          },
        },
      }),
    );
    expect(store.lddPessoal.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: recordId }, data: { balance_amount: 100.3 } }),
    );
    expect(store.lddPessoal.create).not.toHaveBeenCalled();
  });

  it("recusa o mesmo PDF já importado para o cliente, sem tocar no saldo", async () => {
    const rows = [{ period: "01/2024", due_date: "2024-02-20", balance_amount: 1 }];
    const seen = createStore();
    seen.lddImportPessoal.findFirst.mockResolvedValueOnce({ created_at: new Date() });
    const raced = createStore();
    raced.lddImportPessoal.create.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    for (const store of [seen, raced]) {
      await expect(confirmLddImport(store, context, body(rows))).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/já foi importado/),
      });
      expect(store.lddPessoal.create).not.toHaveBeenCalled();
      expect(store.lddPessoal.update).not.toHaveBeenCalled();
    }
    expect(seen.lddImportPessoal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId, client_id: clientId, file_hash: fileHash },
      }),
    );
  });
});
