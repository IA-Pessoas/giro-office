import { describe, expect, it } from "vitest";

import {
  compareIpiSpreadsheets,
  ipiSpreadsheetConferenceCsvExport,
} from "../services/ipiSpreadsheetConferenceService.js";

const A = "11222333000181";
const B = "44555666000199";
const header = "CNPJ Emitente;Modelo;Série;Número;Valor IPI";
const source = (rows: string[], file_name = "planilha.csv") => ({
  file_name,
  content: [header, ...rows].join("\n"),
});

describe("compareIpiSpreadsheets", () => {
  const result = compareIpiSpreadsheets({
    first: source(
      [
        `${A};55;1;100;10,10`,
        `${A};55;1;101;0,10`,
        `${A};55;1;102;5,00`,
        `${A};55;1;103;1,00`,
        `${A};55;1;103;1,00`,
        `${A};55;1;104;`,
        ";;;105;1,00",
        `${A};55;1;106;abc`,
      ],
      "escrita.csv",
    ),
    second: source(
      [`${A};55;1;100;10,10`, `${A};55;1;101;0,30`, `${B};55;1;102;5,00`, `${A};55;1;103;1,00`],
      "apuracao.csv",
    ),
  });

  it("compara IPI por documento e calcula a diferença em centavos", () => {
    expect(result.matched.map((item) => [item.identity, item.first.ipi, item.second.ipi])).toEqual([
      [`${A}|55|1|100`, "10.10", "10.10"],
    ]);
    expect(result.divergent).toEqual([
      expect.objectContaining({
        identity: `${A}|55|1|101`,
        difference: "0.20",
        first: expect.objectContaining({ line: 3, ipi: "0.10" }),
        second: expect.objectContaining({ line: 3, ipi: "0.30" }),
      }),
    ]);
    // Mesmo número com outro emitente não é a mesma nota.
    expect(result.only_first.map((row) => row.identity)).toEqual([`${A}|55|1|102`]);
    expect(result.only_second.map((row) => row.identity)).toEqual([`${B}|55|1|102`]);
  });

  it("mantém duplicatas, IPI ausente, descartes e erros por linha visíveis", () => {
    expect(result.duplicates).toEqual([
      expect.objectContaining({
        identity: `${A}|55|1|103`,
        first: [expect.objectContaining({ line: 5 }), expect.objectContaining({ line: 6 })],
        second: [expect.objectContaining({ line: 5 })],
      }),
    ]);
    expect(result.errors).toEqual([
      { source: "first", line: 7, message: "IPI não informado." },
      { source: "first", line: 9, message: "IPI inválido: abc." },
    ]);
    expect(result.discarded).toEqual([expect.objectContaining({ source: "first", line: 8 })]);
    expect(result.status).toBe("partial");
  });

  it("soma o IPI de cada fonte e a diferença total sem ponto flutuante", () => {
    expect(result.totals).toEqual({ first: "17.20", second: "16.40", difference: "-0.80" });
    expect(result.sources.first).toMatchObject({ file_name: "escrita.csv", data_rows: 8 });
  });

  it("exporta valores de cada fonte e a diferença", () => {
    const { csv, file_name } = ipiSpreadsheetConferenceCsvExport(result);
    expect(file_name).toBe("conferencia-ipi-planilhas.csv");
    const lines = csv.replace(/^﻿/u, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "Situação;Identidade;Linha planilha 1;IPI planilha 1;Linha planilha 2;IPI planilha 2;Diferença (2 − 1);Observação",
    );
    expect(lines).toContain(`Divergente;${A}|55|1|101;3;0,10;3;0,30;0,20;`);
    expect(lines).toContain("Totais;;;17,20;;16,40;(0,80);");
    expect(lines).toContain("Erro;;7;;;;;IPI não informado.");
  });

  it("exige coluna de IPI nas duas planilhas", () => {
    expect(() =>
      compareIpiSpreadsheets({
        first: { file_name: "a.csv", content: `CNPJ Emitente;Modelo;Série;Número\n${A};55;1;1` },
        second: source([`${A};55;1;1;1,00`]),
      }),
    ).toThrow("Arquivo planilha 1: o cabeçalho precisa ter uma coluna de IPI (ex.: Valor IPI).");
  });

  it("fica completo quando tudo foi lido e pareado", () => {
    const clean = compareIpiSpreadsheets({
      first: source([`${A};55;1;1;0,10`, `${A};55;1;2;0,20`]),
      second: source([`${A};55;1;1;0,10`, `${A};55;1;2;0,20`]),
    });
    expect(clean.status).toBe("complete");
    expect(clean.totals).toEqual({ first: "0.30", second: "0.30", difference: "0.00" });
  });
});
