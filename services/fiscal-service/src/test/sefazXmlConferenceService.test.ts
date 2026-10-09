import { createZip, ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import {
  compareSefazWithXml,
  sefazXmlConferenceCsvExport,
} from "../services/sefazXmlConferenceService.js";

function accessKey(issuer: string, series: string, number: string): string {
  const base = `352608${issuer}55${series.padStart(3, "0")}${number.padStart(9, "0")}112345678`;
  let weight = 2;
  let sum = 0;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    sum += Number(base[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return `${base}${rest < 2 ? 0 : 11 - rest}`;
}

const ISSUER = "11222333000181";
const key = (number: string) => accessKey(ISSUER, "1", number);

function nfe(number: string, value: string, options: { key?: boolean; cStat?: string } = {}) {
  const id = options.key === false ? "" : ` Id="NFe${key(number)}"`;
  const protocol = options.cStat
    ? `<protNFe><infProt><cStat>${options.cStat}</cStat></infProt></protNFe>`
    : "";
  return `<nfeProc><NFe><infNFe${id}><ide><mod>55</mod><serie>1</serie><nNF>${number}</nNF></ide><emit><CNPJ>${ISSUER}</CNPJ></emit><total><ICMSTot><vNF>${value}</vNF></ICMSTot></total></infNFe></NFe>${protocol}</nfeProc>`;
}

const zip = (files: Record<string, string>) => ({
  file_name: "xml.zip",
  zip_base64: createZip(
    Object.entries(files).map(([fileName, text]) => ({ fileName, body: Buffer.from(text) })),
  ).toString("base64"),
});

const sefazCsv = [
  "Chave de acesso;CNPJ Emitente;Modelo;Série;Número;Situação;Valor",
  `${key("100")};;;;;Autorizada;10,00`,
  `${key("101")};;;;;Autorizada;10,00`,
  `${key("102")};;;;;Cancelada;5,00`,
  `${key("103")};;;;;Autorizada;1,00`,
  `;${ISSUER};55;1;106;Autorizada;2,00`,
  `${key("105")};;;;;Autorizada;3,00`,
  `${key("107")};;;;;Autorizada;4,00`,
  ";;;;107;Autorizada;4,00",
].join("\n");

const xmlFiles = {
  "100.xml": nfe("100", "10.00"),
  "101.xml": nfe("101", "11.00"),
  "102.xml": nfe("102", "5.00"),
  "104.xml": nfe("104", "7.00"),
  "106.xml": nfe("106", "2.00", { key: false }),
  "105-a.xml": nfe("105", "3.00"),
  "105-b.xml": nfe("105", "3.50"),
  "107.xml": nfe("107", "4.00", { cStat: "101" }),
  "quebrado.xml": "<NFe>",
  "evento.xml": "<procEventoNFe/>",
};

describe("compareSefazWithXml", () => {
  const result = compareSefazWithXml({
    sefaz: { file_name: "sefaz.csv", content: sefazCsv },
    xml: zip(xmlFiles),
  });

  it("pareia pela chave ou pela identidade composta e mostra a chave usada", () => {
    expect(result.matched).toEqual([
      expect.objectContaining({
        identity: `${ISSUER}|55|1|100`,
        match_key: "chave de acesso",
        sefaz: expect.objectContaining({ line: 2, value: "10.00" }),
        xml: expect.objectContaining({ entry: "100.xml", value: "10.00" }),
      }),
      expect.objectContaining({
        identity: `${ISSUER}|55|1|106`,
        match_key: "emitente, modelo, série e número",
        xml: expect.objectContaining({ entry: "106.xml", access_key: null }),
      }),
    ]);
    expect(result.divergent).toEqual([
      expect.objectContaining({
        identity: `${ISSUER}|55|1|101`,
        differences: ["Valor: SEFAZ 10.00 × XML 11.00"],
      }),
    ]);
  });

  it("separa situação não comparável, duplicata, inválido e ausência real", () => {
    expect(
      result.not_comparable.map((item) => [
        item.identity,
        item.reason,
        item.sefaz.map((row) => row.line),
        item.xml.map((row) => row.entry),
      ]),
    ).toEqual([
      [`${ISSUER}|55|1|102`, 'SEFAZ: situação "Cancelada"', [4], ["102.xml"]],
      [`${ISSUER}|55|1|107`, "XML: protocolo com cStat 101", [8], ["107.xml"]],
    ]);
    expect(result.duplicates).toEqual([
      expect.objectContaining({
        identity: `${ISSUER}|55|1|105`,
        sefaz: [expect.objectContaining({ line: 7 })],
        xml: [
          expect.objectContaining({ entry: "105-a.xml" }),
          expect.objectContaining({ entry: "105-b.xml" }),
        ],
      }),
    ]);
    expect(result.only_sefaz.map((row) => row.line)).toEqual([5]);
    expect(result.only_xml.map((row) => row.entry)).toEqual(["104.xml"]);
    expect(result.errors).toEqual([
      { source: "xml", entry: "quebrado.xml", message: "XML inválido." },
    ]);
    expect(result.discarded).toEqual([
      {
        source: "sefaz",
        line: 9,
        reason:
          "Sem chave de acesso e sem emitente, modelo, série e número; o número isolado não identifica a nota.",
      },
      { source: "xml", entry: "evento.xml", reason: "XML não é uma NF-e (sem infNFe)." },
    ]);
    expect(result.status).toBe("partial");
    expect(result.summary).toEqual({
      matched: 2,
      divergent: 1,
      only_sefaz: 1,
      only_xml: 1,
      duplicates: 1,
      not_comparable: 2,
      discarded: 2,
      errors: 1,
    });
  });

  it("soma os valores das linhas e notas lidas", () => {
    expect(result.sources.xml).toEqual({ file_name: "xml.zip", entries: 10, nfe_entries: 8 });
    expect(result.totals).toEqual({ sefaz: "35.00", xml: "45.50" });
  });

  it("exporta a mesma classificação em CSV", () => {
    const { csv, file_name } = sefazXmlConferenceCsvExport(result);
    expect(file_name).toBe("conferencia-sefaz-xml.csv");
    const lines = csv.replace(/^﻿/u, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "Situação;Identidade;Chave usada;Linha SEFAZ;Valor SEFAZ;Arquivo XML;Valor XML;Observação",
    );
    expect(lines).toContain(
      `Coincidente;${ISSUER}|55|1|100;chave de acesso;2;10,00;100.xml;10,00;XML sem protocolo de autorização`,
    );
    expect(lines).toContain(`Só XML;${ISSUER}|55|1|104;;;;104.xml;7,00;`);
    expect(lines).toContain(
      `Não comparável;${ISSUER}|55|1|102;;4;5,00;102.xml;5,00;"SEFAZ: situação ""Cancelada"""`,
    );
    expect(lines).toContain("Erro;;;;;quebrado.xml;;XML inválido.");
    expect(lines.filter((line) => line.startsWith("Resultado;"))).toHaveLength(1);
  });

  it("não aceita situação negada, denegada ou cancelada como autorizada", () => {
    const statuses = [
      "Autorizada",
      "Uso autorizado",
      "Não autorizada",
      "Autorização denegada",
      "Cancelada",
    ];
    const csv = [
      "Chave;Situação",
      ...statuses.map((status, index) => `${key(String(200 + index))};${status}`),
    ].join("\n");
    const files = Object.fromEntries(
      statuses.map((_, index) => [`${200 + index}.xml`, nfe(String(200 + index), "1.00")]),
    );
    const outcome = compareSefazWithXml({
      sefaz: { file_name: "s.csv", content: csv },
      xml: zip(files),
    });
    expect(outcome.matched.map((pair) => pair.sefaz.status)).toEqual([
      "Autorizada",
      "Uso autorizado",
    ]);
    expect(outcome.not_comparable.map((item) => item.reason)).toEqual([
      'SEFAZ: situação "Não autorizada"',
      'SEFAZ: situação "Autorização denegada"',
      'SEFAZ: situação "Cancelada"',
    ]);
  });

  it("usa a identidade composta como chave quando as chaves divergem", () => {
    const otherKey = `${key("300").slice(0, 35)}87654321`;
    const fixedKey = (() => {
      let weight = 2;
      let sum = 0;
      for (let i = otherKey.length - 1; i >= 0; i -= 1) {
        sum += Number(otherKey[i]) * weight;
        weight = weight === 9 ? 2 : weight + 1;
      }
      const rest = sum % 11;
      return `${otherKey.slice(0, 43)}${rest < 2 ? 0 : 11 - rest}`;
    })();
    const outcome = compareSefazWithXml({
      sefaz: { file_name: "s.csv", content: `Chave\n${fixedKey}` },
      xml: zip({ "300.xml": nfe("300", "1.00") }),
    });
    expect(outcome.divergent[0]).toMatchObject({
      match_key: "emitente, modelo, série e número",
      differences: ["Chave de acesso diferente"],
    });
  });

  it("não chama de divergência o valor ausente e trata cópia idêntica como descarte", () => {
    const outcome = compareSefazWithXml({
      sefaz: { file_name: "s.csv", content: `Chave;Valor\n${key("400")};` },
      xml: zip({
        "proc.xml": nfe("400", "4.00", { cStat: "100" }),
        "sem-protocolo.xml": nfe("400", "4.00"),
      }),
    });
    expect(outcome.matched[0]?.notes).toEqual(["Valor ausente em um dos lados"]);
    expect(outcome.duplicates).toEqual([]);
    expect(outcome.discarded).toEqual([
      { source: "xml", entry: "sem-protocolo.xml", reason: "Cópia idêntica de proc.xml." },
    ]);
    expect(outcome.status).toBe("complete");
  });

  it("deixa parcial o ZIP sem nenhuma NF-e e mantém duplicata com situação ruim como duplicata", () => {
    const empty = compareSefazWithXml({
      sefaz: { file_name: "s.csv", content: `Chave\n${key("500")}` },
      xml: zip({ "evento.xml": "<procEventoNFe/>" }),
    });
    expect(empty.status).toBe("partial");
    expect(empty.only_sefaz).toHaveLength(1);

    const duplicated = compareSefazWithXml({
      sefaz: {
        file_name: "s.csv",
        content: `Chave;Situação\n${key("501")};Cancelada\n${key("501")};Autorizada`,
      },
      xml: zip({ "501.xml": nfe("501", "1.00") }),
    });
    expect(duplicated.duplicates).toHaveLength(1);
    expect(duplicated.not_comparable).toEqual([]);
  });

  it("fica completo sem erros, descartes de planilha ou duplicatas", () => {
    const clean = compareSefazWithXml({
      sefaz: { file_name: "s.csv", content: `Chave;Situação\n${key("100")};Autorizada` },
      xml: zip({ "100.xml": nfe("100", "10.00", { cStat: "100" }) }),
    });
    expect(clean.status).toBe("complete");
    expect(clean.matched).toHaveLength(1);
    expect(clean.totals).toEqual({ sefaz: null, xml: "10.00" });
  });

  it("recusa planilha sem identidade e ZIP ilegível sem relatório", () => {
    expect(() =>
      compareSefazWithXml({
        sefaz: { file_name: "s.csv", content: "Número\n1" },
        xml: zip({ "a.xml": nfe("1", "1.00") }),
      }),
    ).toThrow(/Arquivo SEFAZ/u);
    expect(() =>
      compareSefazWithXml({
        sefaz: { file_name: "s.csv", content: `Chave\n${key("1")}` },
        xml: { file_name: "x.zip", zip_base64: "bm9wZQ==" },
      }),
    ).toThrow(ServiceError);
  });
});
