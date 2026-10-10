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
        reason: "CPF/CNPJ deve ter 11 ou 14 dígitos; a célula tem 6.",
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

  it("recusa XLSX que declara conteúdo descompactado acima do limite", () => {
    const bytes = veriWorkbook([["a"], ["b"], ["Alfa", "", "11222333000181"]]);
    // Tamanho descompactado da primeira entrada do diretório central (deslocamento 24).
    const directory = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(VERI_LIMITS.uncompressedBytes + 1, directory + 24);

    expect(() => parseVeriWorkbook(bytes)).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});
