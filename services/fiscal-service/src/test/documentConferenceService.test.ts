import { ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import {
  compareDocumentSpreadsheets,
  documentConferenceCsvExport,
  parseConferenceCsv,
} from "../services/documentConferenceService.js";

/** Chave NF-e sintética com dígito verificador módulo 11 válido. */
function accessKey(
  issuer: string,
  model: string,
  series: string,
  number: string,
  code = "12345678",
): string {
  const base = `352608${issuer}${model}${series.padStart(3, "0")}${number.padStart(9, "0")}1${code}`;
  let weight = 2;
  let sum = 0;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    sum += Number(base[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return `${base}${rest < 2 ? 0 : 11 - rest}`;
}

const ISSUER_A = "11222333000181";
const ISSUER_B = "44555666000199";

function source(content: string, file_name = "arquivo.csv") {
  return { file_name, content };
}

describe("parseConferenceCsv", () => {
  it("detecta ponto e vírgula, aspas, BOM e linhas em branco", () => {
    const rows = parseConferenceCsv('﻿Número;Série\r\n"10";"1;2"\r\n\r\n11;3\n');
    expect(rows).toEqual([
      { line: 1, cells: ["Número", "Série"] },
      { line: 2, cells: ["10", "1;2"] },
      { line: 4, cells: ["11", "3"] },
    ]);
  });

  it("aceita vírgula e aspas escapadas", () => {
    expect(parseConferenceCsv('a,b\n"x ""y""",z')).toEqual([
      { line: 1, cells: ["a", "b"] },
      { line: 2, cells: ['x "y"', "z"] },
    ]);
  });
});

describe("compareDocumentSpreadsheets", () => {
  const keyA1 = accessKey(ISSUER_A, "55", "1", "100");

  it("cruza chave de acesso com emitente/modelo/série/número e classifica cada nota", () => {
    const dominio = [
      "Chave de acesso;CNPJ Emitente;Modelo;Série;Número;Valor",
      `${keyA1};;;;;1.234,56`,
      `;${ISSUER_A};55;1;101;10,00`,
      `;${ISSUER_A};55;1;102;5,00`,
      `;${ISSUER_B};55;1;100;7,00`,
    ].join("\n");
    const sefaz = [
      "CNPJ Emitente,Modelo,Série,Número,Valor Total",
      `${ISSUER_A},55,1,100,1234.56`,
      `${ISSUER_A},55,1,101,10.01`,
      `${ISSUER_A},55,2,100,3.00`,
    ].join("\n");

    const result = compareDocumentSpreadsheets({
      dominio: source(dominio, "dominio.csv"),
      sefaz: source(sefaz, "sefaz.csv"),
    });

    expect(result.status).toBe("complete");
    expect(result.summary).toEqual({
      matched: 1,
      divergent: 1,
      only_dominio: 2,
      only_sefaz: 1,
      duplicates: 0,
      discarded: 0,
      errors: 0,
    });
    expect(result.matched[0]).toMatchObject({
      identity: `${ISSUER_A}|55|1|100`,
      dominio: { line: 2, access_key: keyA1, value: "1234.56" },
      sefaz: { line: 2, access_key: null, value: "1234.56" },
    });
    expect(result.divergent[0]).toMatchObject({
      identity: `${ISSUER_A}|55|1|101`,
      differences: ["Valor: Domínio 10.00 × SEFAZ 10.01"],
    });
    // Mesmo número 100 com outro emitente ou outra série não colide.
    expect(result.only_dominio.map((row) => row.identity)).toEqual([
      `${ISSUER_A}|55|1|102`,
      `${ISSUER_B}|55|1|100`,
    ]);
    expect(result.only_sefaz.map((row) => row.identity)).toEqual([`${ISSUER_A}|55|2|100`]);
    expect(result.totals).toEqual({ dominio: "1256.56", sefaz: "1247.57" });
    expect(result.sources.dominio).toEqual({
      file_name: "dominio.csv",
      data_rows: 4,
      accepted_rows: 4,
      identity_columns: ["Chave de acesso", "CNPJ Emitente", "Modelo", "Série", "Número"],
      value_column: true,
      ipi_column: false,
    });
  });

  it("não escolhe correspondência para identidade repetida e mostra as duplicatas", () => {
    const dominio = [
      "Número;Série;Modelo;CNPJ Emitente;Valor",
      `100;1;55;${ISSUER_A};1,00`,
      `100;1;55;${ISSUER_A};2,00`,
    ].join("\n");
    const sefaz = ["Número;Série;Modelo;CNPJ Emitente;Valor", `100;1;55;${ISSUER_A};1,00`].join(
      "\n",
    );

    const result = compareDocumentSpreadsheets({ dominio: source(dominio), sefaz: source(sefaz) });

    expect(result.matched).toEqual([]);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]?.dominio.map((row) => row.line)).toEqual([2, 3]);
    expect(result.duplicates[0]?.sefaz.map((row) => row.line)).toEqual([2]);
    // Linhas não pareadas: a conferência não pode parecer completa.
    expect(result.status).toBe("partial");
  });

  it("aponta chaves de acesso diferentes para a mesma nota", () => {
    const otherKey = accessKey(ISSUER_A, "55", "1", "100", "87654321");
    const result = compareDocumentSpreadsheets({
      dominio: source(`Chave\n${keyA1}`),
      sefaz: source(`Chave\n${otherKey}`),
    });
    expect(result.divergent[0]?.differences).toEqual(["Chave de acesso diferente"]);
  });

  it("descarta número isolado e lista erros por linha como resultado parcial", () => {
    const dominio = [
      "Chave;Número;Série;Modelo;CNPJ Emitente;Valor",
      ";100;;;;1,00",
      `${keyA1.slice(0, 43)}${(Number(keyA1[43]) + 1) % 10};;;;;1,00`,
      `;101;1;55;${ISSUER_A};abc`,
      `;102;1;55;${ISSUER_A}`,
    ].join("\n");
    const result = compareDocumentSpreadsheets({
      dominio: source(dominio),
      sefaz: source(`Chave\n${keyA1}`),
    });

    expect(result.status).toBe("partial");
    expect(result.discarded).toEqual([
      {
        source: "dominio",
        line: 2,
        reason:
          "Sem chave de acesso e sem emitente, modelo, série e número; o número isolado não identifica a nota.",
      },
    ]);
    expect(result.errors).toEqual([
      { source: "dominio", line: 3, message: "Chave de acesso inválida." },
      { source: "dominio", line: 4, message: "Valor inválido: abc." },
      { source: "dominio", line: 5, message: "Linha com 5 coluna(s); o cabeçalho tem 6." },
    ]);
    expect(result.summary.errors).toBe(3);
    expect(result.only_sefaz).toHaveLength(1);
  });

  it("recusa arquivo sem cabeçalho reconhecível ou sem linhas", () => {
    const valid = source(`Chave\n${keyA1}`);
    expect(() =>
      compareDocumentSpreadsheets({ dominio: source("Data;Cliente\n1;2"), sefaz: valid }),
    ).toThrow(ServiceError);
    expect(() =>
      compareDocumentSpreadsheets({ dominio: source("Número;Valor\n1;2"), sefaz: valid }),
    ).toThrow(/Domínio.*chave de acesso ou as colunas emitente, modelo, série e número/u);
    expect(() => compareDocumentSpreadsheets({ dominio: valid, sefaz: source("Chave\n") })).toThrow(
      /SEFAZ.*nenhuma linha/u,
    );
  });

  it("aceita CPF como emitente e zeros à esquerda em série e número", () => {
    const result = compareDocumentSpreadsheets({
      dominio: source("CPF/CNPJ Emitente;Modelo;Série;Número\n123.456.789-09;55;001;000000100"),
      sefaz: source("Emitente;Modelo;Série;Número\n12345678909;55;1;100"),
    });
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.identity).toBe("00012345678909|55|1|100");
  });

  it("casa emitente CPF da chave de acesso com o CPF da coluna", () => {
    const cpfKey = accessKey("00012345678909", "55", "1", "7");
    const result = compareDocumentSpreadsheets({
      dominio: source(`Chave\n${cpfKey}`),
      sefaz: source("CPF/CNPJ Emitente;Modelo;Série;Número\n123.456.789-09;55;1;7"),
    });
    expect(result.matched).toHaveLength(1);
  });

  it("lê R$, sinal e parênteses como valor negativo", () => {
    const header = "CNPJ Emitente;Modelo;Série;Número;Valor";
    const result = compareDocumentSpreadsheets({
      dominio: source(`${header}\n${ISSUER_A};55;1;1;(10,00)\n${ISSUER_A};55;1;2;-R$ 1.000,50`),
      sefaz: source(`${header}\n${ISSUER_A};55;1;1;R$ -10,00\n${ISSUER_A};55;1;2;-1000.5`),
    });
    expect(result.matched.map((pair) => pair.dominio.value)).toEqual(["-10.00", "-1000.50"]);
  });

  it("recusa aspas não fechadas em vez de engolir as linhas seguintes", () => {
    expect(() =>
      compareDocumentSpreadsheets({
        dominio: source(`Chave;Obs\n${keyA1};"sem fim\n${keyA1};ok`),
        sefaz: source(`Chave\n${keyA1}`),
      }),
    ).toThrow("Arquivo Domínio: aspas abertas na linha 2 não foram fechadas.");
  });

  it("ignora CNPJ genérico, que pode ser do destinatário", () => {
    expect(() =>
      compareDocumentSpreadsheets({
        dominio: source(`CNPJ;Modelo;Série;Número\n${ISSUER_A};55;1;1`),
        sefaz: source(`Chave\n${keyA1}`),
      }),
    ).toThrow(/cabeçalho precisa ter/u);
  });
});

describe("documentConferenceCsvExport", () => {
  it("exporta uma linha por item com situação e marca o resultado parcial", () => {
    const key = accessKey(ISSUER_A, "55", "1", "100");
    const result = compareDocumentSpreadsheets({
      dominio: source(`Chave;Valor\n${key};1,50\n;2,00`),
      sefaz: source(`Chave;Valor\n${key};1,50`),
    });
    const { csv, file_name } = documentConferenceCsvExport(result);
    expect(file_name).toBe("conferencia-dominio-sefaz.csv");
    const lines = csv.replace(/^﻿/u, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "Situação;Identidade;Linha Domínio;Valor Domínio;Linha SEFAZ;Valor SEFAZ;Observação",
    );
    expect(lines).toContain(`Coincidente;${ISSUER_A}|55|1|100;2;1,50;2;1,50;`);
    expect(lines[lines.length - 1]).toMatch(/^Descartada;;3;;;;"Sem chave de acesso/u);
    expect(lines).toContain(
      "Resultado;Conferência parcial: há linhas descartadas, com erro ou duplicadas;;;;;",
    );
  });
});
