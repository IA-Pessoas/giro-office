import { createZip, ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { compareSpedWithXml, spedConferenceCsvExport } from "../services/spedConferenceService.js";

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

const OWN = "11222333000181";
const SUPPLIER = "44555666000199";

/** Registro SPED com os campos informados e o restante vazio até `size`. */
function record(fields: (string | number)[], size: number): string {
  const values = [...fields.map(String), ...Array(Math.max(0, size - fields.length)).fill("")];
  return `|${values.join("|")}|`;
}

const c100 = (opts: {
  emit?: "0" | "1";
  part?: string;
  sit?: string;
  series: string;
  number: string;
  key?: string;
  value: string;
}) =>
  record(
    [
      "C100",
      "0",
      opts.emit ?? "0",
      opts.part ?? "",
      "55",
      opts.sit ?? "00",
      opts.series,
      opts.number,
      opts.key ?? "",
      "01082026",
      "01082026",
      opts.value,
    ],
    29,
  );
const c170 = (item: string, code: string, qty: string, value: string, cfop = "5102") =>
  record(["C170", item, code, "", qty, "UN", value, "0", "0", "000", cfop], 37);

function nfe(
  issuer: string,
  number: string,
  value: string,
  items: [string, string, string, string][],
  withKey = true,
) {
  const id = withKey ? ` Id="NFe${accessKey(issuer, "1", number)}"` : "";
  const det = items
    .map(
      ([n, code, qty, vProd]) =>
        `<det nItem="${n}"><prod><cProd>${code}</cProd><xProd>Item ${n}</xProd><CFOP>5102</CFOP><qCom>${qty}</qCom><vProd>${vProd}</vProd></prod></det>`,
    )
    .join("");
  return `<NFe><infNFe${id}><ide><mod>55</mod><serie>1</serie><nNF>${number}</nNF></ide><emit><CNPJ>${issuer}</CNPJ></emit>${det}<total><ICMSTot><vNF>${value}</vNF></ICMSTot></total></infNFe></NFe>`;
}

const zip = (files: Record<string, string>) => ({
  file_name: "xml.zip",
  zip_base64: createZip(
    Object.entries(files).map(([fileName, text]) => ({ fileName, body: Buffer.from(text) })),
  ).toString("base64"),
});

const sped = [
  record(["0000", "017", "0", "01082026", "31082026", "EMPRESA", OWN, "", "SP"], 15),
  record(["0150", "F1", "FORNECEDOR", "1058", SUPPLIER, ""], 13),
  // Documento próprio com chave: item 2 diverge no valor.
  c100({ series: "1", number: "100", key: accessKey(OWN, "1", "100"), value: "10,00" }),
  c170("1", "A", "2,00000", "6,00"),
  c170("2", "B", "1", "4,00"),
  "|C190|000|5102|0|10,00|0|0|0|0|0|0|",
  // Documento de terceiro sem chave, emitente pelo 0150; itens batem.
  c100({ emit: "1", part: "F1", series: "1", number: "200", value: "3,00" }),
  c170("1", "X", "3", "3,00", "1102"),
  // Cancelado: não comparável.
  c100({ sit: "02", series: "1", number: "101", key: accessKey(OWN, "1", "101"), value: "" }),
  // Só no SPED.
  c100({ series: "1", number: "102", key: accessKey(OWN, "1", "102"), value: "1,00" }),
  c170("1", "A", "1", "1,00"),
  // Item duplicado no mesmo documento.
  c100({ series: "1", number: "103", key: accessKey(OWN, "1", "103"), value: "2,00" }),
  c170("1", "A", "1", "1,00"),
  c170("1", "A", "1", "1,00"),
  "|C990|20|",
  // C170 fora de um C100: erro, não vai para o documento anterior.
  c170("9", "Z", "1", "1,00"),
  "|C100|0|0||55|00|1|",
  "linha sem pipes",
].join("\r\n");

const xml = zip({
  "100.xml": nfe(OWN, "100", "10.00", [
    ["1", "A", "2.0000", "6.00"],
    ["2", "B", "1.0000", "4.50"],
    ["3", "C", "1.0000", "0.00"],
  ]),
  "200.xml": nfe(SUPPLIER, "200", "3.00", [["1", "SUP-1", "3.0000", "3.00"]], false),
  "101.xml": nfe(OWN, "101", "5.00", []),
  "103.xml": nfe(OWN, "103", "2.00", [["1", "A", "1", "1.00"]]),
  "104.xml": nfe(OWN, "104", "7.00", []),
});

describe("compareSpedWithXml", () => {
  const result = compareSpedWithXml({ sped: { file_name: "sped.txt", content: sped }, xml });

  it("pareia C100 com NF-e pela chave ou pelo emitente do 0000/0150", () => {
    expect(result.matched.map((item) => [item.identity, item.match_key])).toEqual([
      [`${SUPPLIER}|55|1|200`, "emitente, modelo, série e número"],
    ]);
    // Terceiro: código e CFOP do item são do destinatário e não entram na comparação.
    expect(result.matched[0]?.items).toEqual([
      expect.objectContaining({ situation: "Coincidente", number: "1", differences: [] }),
    ]);
    expect(result.only_sped.map((doc) => doc.number)).toEqual(["102"]);
    expect(result.only_xml.map((row) => row.entry)).toEqual(["104.xml"]);
    expect(result.not_comparable).toEqual([
      expect.objectContaining({
        identity: `${OWN}|55|1|101`,
        reason: "SPED: COD_SIT 02 (cancelado)",
      }),
    ]);
  });

  it("compara itens só dentro do mesmo documento, pelo número do item", () => {
    const doc100 = result.divergent.find((item) => item.identity === `${OWN}|55|1|100`);
    expect(doc100?.match_key).toBe("chave de acesso");
    expect(doc100?.differences).toEqual(["Itens: 2 no SPED × 3 no XML"]);
    expect(
      doc100?.items.map((item) => [item.situation, item.number, item.differences, item.sped?.line]),
    ).toEqual([
      ["Coincidente", "1", [], 4],
      ["Divergente", "2", ["Valor: SPED 4.00 × XML 4.50"], 5],
      ["Só XML", "3", [], undefined],
    ]);

    const doc103 = result.divergent.find((item) => item.identity === `${OWN}|55|1|103`);
    expect(doc103?.items).toEqual([
      expect.objectContaining({
        situation: "Duplicado",
        number: "1",
        note: "Item repetido: linhas 13, 14 do SPED e 1 no XML; sem correspondência automática",
      }),
    ]);
  });

  it("deixa explícitos erros de leiaute sem deslocar itens", () => {
    expect(result.errors).toEqual([
      { source: "sped", line: 16, message: "C170 sem C100 correspondente." },
      { source: "sped", line: 17, message: "C100 com 7 campo(s); o leiaute pede ao menos 12." },
      { source: "sped", line: 18, message: "Linha fora do leiaute SPED (|REG|...|)." },
    ]);
    expect(result.status).toBe("partial");
    expect(result.sources.sped).toEqual({
      file_name: "sped.txt",
      lines: 18,
      documents: 5,
      items: 6,
      period: "01082026 a 31082026",
    });
  });

  it("soma documentos e itens de cada fonte", () => {
    expect(result.totals).toEqual({
      sped_documents: "16.00",
      xml_documents: "27.00",
      // Itens só dos pares comparados (100 e 200; o 103 tem item duplicado, sem valor pareado).
      sped_items: "13.00",
      xml_items: "13.50",
    });
    expect(result.summary).toMatchObject({
      matched: 1,
      divergent: 2,
      only_sped: 1,
      only_xml: 1,
      not_comparable: 1,
      errors: 3,
      items_divergent: 1,
      items_only_xml: 1,
      items_duplicates: 1,
    });
  });

  it("exporta documento e itens na mesma ordem", () => {
    const { csv, file_name } = spedConferenceCsvExport(result);
    expect(file_name).toBe("conferencia-sped-xml.csv");
    const lines = csv.replace(/^﻿/u, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "Nível;Situação;Identidade;Chave usada;Item;Linha SPED;Valor SPED;Arquivo XML;Valor XML;Observação",
    );
    const doc = lines.findIndex((line) => line.startsWith(`Documento;Divergente;${OWN}|55|1|100`));
    expect(lines.slice(doc + 1, doc + 4)).toEqual([
      `Item;Coincidente;${OWN}|55|1|100;;1;4;6,00;100.xml;6,00;`,
      `Item;Divergente;${OWN}|55|1|100;;2;5;4,00;100.xml;4,50;Valor: SPED 4.00 × XML 4.50`,
      `Item;Só XML;${OWN}|55|1|100;;3;;;100.xml;0,00;`,
    ]);
    expect(lines).toContain("Arquivo;Erro;;;;16;;;;C170 sem C100 correspondente.");
  });

  it("C100 recusado no meio fecha o documento e descarta seus itens por linha", () => {
    const content = [
      record(["0000", "017", "0", "01082026", "31082026", "EMPRESA", OWN, "", "SP"], 15),
      c100({ series: "1", number: "100", key: accessKey(OWN, "1", "100"), value: "10,00" }),
      c170("1", "A", "2", "6,00"),
      "|C100|0|0||55|00|1|",
      c170("2", "B", "1", "4,00"),
      c100({ series: "1", number: "999", key: accessKey(OWN, "1", "100"), value: "1,00" }),
      c170("1", "A", "1", "1,00"),
    ].join("\n");
    const outcome = compareSpedWithXml({
      sped: { file_name: "s.txt", content },
      xml: zip({ "100.xml": nfe(OWN, "100", "10.00", [["1", "A", "2", "6.00"]]) }),
    });
    expect(outcome.matched.map((pair) => pair.items.length)).toEqual([1]);
    expect(outcome.errors.map((error) => error.message)).toEqual([
      "C100 com 7 campo(s); o leiaute pede ao menos 12.",
      "SER/NUM_DOC do C100 não conferem com a chave de acesso.",
    ]);
    expect(outcome.discarded).toEqual([
      { source: "sped", line: 5, reason: "C170 do registro recusado na linha 4." },
      { source: "sped", line: 7, reason: "C170 do registro recusado na linha 6." },
    ]);
  });

  it("não compara itens quando o SPED não traz C170 da nota", () => {
    const content = [
      record(["0000", "017", "0", "01082026", "31082026", "EMPRESA", OWN, "", "SP"], 15),
      c100({ series: "1", number: "100", key: accessKey(OWN, "1", "100"), value: "10,00" }),
    ].join("\n");
    const outcome = compareSpedWithXml({
      sped: { file_name: "s.txt", content },
      xml: zip({ "100.xml": nfe(OWN, "100", "10.00", [["1", "A", "1", "10.00"]]) }),
    });
    expect(outcome.matched[0]).toMatchObject({ items_compared: false, items: [] });
    expect(outcome.status).toBe("complete");
    expect(spedConferenceCsvExport(outcome).csv).toContain(
      "SPED sem C170 para a nota; itens não comparados",
    );
  });

  it("recusa 0000 de outro leiaute e arquivo só com C170", () => {
    expect(() =>
      compareSpedWithXml({
        sped: {
          file_name: "c.txt",
          content: `|0000|006|0|||01082026|31082026|EMPRESA|${OWN}|\n${c100({ series: "1", number: "1", value: "1,00" })}`,
        },
        xml,
      }),
    ).toThrow(/fora do leiaute da EFD ICMS\/IPI/u);
    expect(() =>
      compareSpedWithXml({
        sped: { file_name: "c.txt", content: c170("1", "A", "1", "1,00") },
        xml,
      }),
    ).toThrow("Arquivo SPED: nenhum registro C100 encontrado.");
  });

  it("recusa arquivo sem registros SPED ou ZIP ilegível", () => {
    expect(() =>
      compareSpedWithXml({ sped: { file_name: "x.txt", content: "nada aqui" }, xml }),
    ).toThrow("Arquivo SPED: nenhum registro C100 encontrado.");
    expect(() =>
      compareSpedWithXml({
        sped: { file_name: "x.txt", content: sped },
        xml: { file_name: "x.zip", zip_base64: "bm9wZQ==" },
      }),
    ).toThrow(ServiceError);
  });
});
