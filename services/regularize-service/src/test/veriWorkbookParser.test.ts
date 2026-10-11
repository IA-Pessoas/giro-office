import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { parseVeriWorkbook, VERI_LIMITS } from "../services/veriWorkbookParser.js";
import { veriWorkbook } from "./veriFixtures.js";

// Casos sintéticos montados a partir do relatorios/veri.php: não há amostra real do Veri.
describe("parseVeriWorkbook", () => {
  it("lê da linha 3 em diante, nome na coluna A e CNPJ na coluna C", () => {
    const result = parseVeriWorkbook(
      veriWorkbook([
        ["Relatório Veri", "", "99.999.999/0001-91"],
        ["Razão Social", "Fantasia", "CNPJ"],
        ["Alfa Ltda", "Alfa", "11.222.333/0001-81"],
        ["Beta ME", "ignorar: 11.444.777/0001-61", "11.444.777/0001-61"],
      ]),
    );

    expect(result).toEqual({
      entries: [
        { row: 3, name: "Alfa Ltda", document: "11222333000181" },
        { row: 4, name: "Beta ME", document: "11444777000161" },
      ],
      invalid: [],
    });
  });

  it("separa as entradas inválidas com a linha e o motivo", () => {
    const result = parseVeriWorkbook(
      veriWorkbook([
        ["cabeçalho"],
        ["cabeçalho"],
        ["Alfa Ltda", "", "11.222.333/0001-81"],
        ["Sem documento", "", ""],
        ["", "", ""],
        ["Documento curto", "", "123.456"],
        ["Alfa repetida", "", "11222333000181"],
        ["", "", "11.444.777/0001-61"],
      ]),
    );

    expect(result.entries).toEqual([
      { row: 3, name: "Alfa Ltda", document: "11222333000181" },
      { row: 8, name: "", document: "11444777000161" },
    ]);
    expect(result.invalid).toEqual([
      { row: 4, name: "Sem documento", value: "", reason: "CNPJ não informado." },
      {
        row: 6,
        name: "Documento curto",
        value: "123.456",
        reason: "Não é um CPF (11 dígitos) nem um CNPJ (14 posições).",
      },
      {
        row: 7,
        name: "Alfa repetida",
        value: "11222333000181",
        reason: "CNPJ repetido; já aparece na linha 3.",
      },
    ]);
  });

  it("recupera o zero à esquerda de CNPJ gravado como número", () => {
    const result = parseVeriWorkbook(
      veriWorkbook([
        ["a"],
        ["b"],
        ["Zero à esquerda", "", 1444777000161],
        ["CPF número", "", 1234567890],
      ]),
    );

    expect(result.entries).toEqual([
      { row: 3, name: "Zero à esquerda", document: "01444777000161" },
      { row: 4, name: "CPF número", document: "01234567890" },
    ]);
  });

  it("não completa com zeros um número curto demais para ser CPF ou CNPJ", () => {
    const result = parseVeriWorkbook(
      veriWorkbook([["a"], ["b"], ["Número curto", "", 123456], ["Decimal", "", 1.5]]),
    );

    expect(result.entries).toEqual([]);
    expect(result.invalid.map((entry) => [entry.row, entry.reason])).toEqual([
      [3, "Não é um CPF (11 dígitos) nem um CNPJ (14 posições)."],
      [4, "Não é um CPF (11 dígitos) nem um CNPJ (14 posições)."],
    ]);
  });

  it("usa o endereço da célula, mesmo quando a planilha não começa em A1", () => {
    // Só a área B4:C5 está preenchida: a coluna A fica vazia e a linha 3 não existe.
    const result = parseVeriWorkbook(
      veriWorkbook(
        [
          ["coluna B", "11.222.333/0001-81"],
          ["coluna B", "11.444.777/0001-61"],
        ],
        "B4",
      ),
    );

    expect(result).toEqual({
      entries: [
        { row: 4, name: "", document: "11222333000181" },
        { row: 5, name: "", document: "11444777000161" },
      ],
      invalid: [],
    });
  });

  it("aceita planilha sem linhas de dados", () => {
    expect(parseVeriWorkbook(veriWorkbook([["a"], ["b"]]))).toEqual({ entries: [], invalid: [] });
  });

  it("recusa arquivo que não é XLSX, grande demais ou com linhas demais", () => {
    expect(() => parseVeriWorkbook(Buffer.from("nome;cnpj\nAlfa;1"))).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(() => parseVeriWorkbook(Buffer.alloc(VERI_LIMITS.bytes + 1))).toThrowError(
      expect.objectContaining({ statusCode: 413 }),
    );
    const tooManyRows = Array.from({ length: VERI_LIMITS.rows + 3 }, (_, index) => [
      `Cliente ${index}`,
      "",
      "11222333000181",
    ]);
    expect(() => parseVeriWorkbook(veriWorkbook(tooManyRows))).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it("não aceita texto com letras no lugar do documento", () => {
    const result = parseVeriWorkbook(
      veriWorkbook([
        ["a"],
        ["b"],
        ["Texto de 11 letras", "", "SEM CADASTRO"],
        ["CNPJ alfanumérico", "", "12.ABC.345/01DE-35"],
      ]),
    );

    expect(result.entries).toEqual([
      { row: 4, name: "CNPJ alfanumérico", document: "12ABC34501DE35" },
    ]);
    expect(result.invalid.map((entry) => entry.row)).toEqual([3]);
  });

  it("recusa XLSX pequeno no envio que infla acima do limite", () => {
    // Textos longos e repetitivos: poucos KiB compactados, mais de 8 MiB descompactados.
    const rows = Array.from({ length: 4000 }, (_, index) => [
      String(index).padEnd(2500, "x"),
      "",
      "11222333000181",
    ]);
    const bytes = veriWorkbook([["a"], ["b"], ...rows]);

    expect(bytes.length).toBeLessThan(VERI_LIMITS.bytes);
    expect(() => parseVeriWorkbook(bytes)).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        message: "O XLSX descompactado excede o limite de 8 MiB.",
      }),
    );
  });

  it("recusa planilha com colunas demais", () => {
    const wide = Array.from({ length: VERI_LIMITS.columns + 1 }, (_, index) => `c${index}`);

    expect(() => parseVeriWorkbook(veriWorkbook([["a"], ["b"], wide]))).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        message: "O XLSX excede o limite de 64 colunas.",
      }),
    );
  });

  it("recusa ZIP com diretório truncado sem estourar a leitura", () => {
    const bytes = veriWorkbook([["a"], ["b"], ["Alfa", "", "11222333000181"]]);

    expect(() => parseVeriWorkbook(bytes.subarray(0, bytes.length - 30))).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});
