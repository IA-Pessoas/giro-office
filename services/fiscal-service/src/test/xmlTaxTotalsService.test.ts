import { createZip, ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { sumXmlTaxes, xmlTaxTotalsCsvExport } from "../services/xmlTaxTotalsService.js";

const ISSUER = "11222333000181";

type Item = { ipi?: string; st?: string };

function nfe(
  number: string,
  items: Item[],
  declared: { ipi?: string; st?: string } = {},
  options: { cStat?: string; marker?: string } = {},
) {
  const det = items
    .map((item, index) => {
      const ipi =
        item.ipi === undefined ? "" : `<IPI><IPITrib><vIPI>${item.ipi}</vIPI></IPITrib></IPI>`;
      const st =
        item.st === undefined
          ? "<ICMS><ICMS00><vICMS>1.00</vICMS></ICMS00></ICMS>"
          : `<ICMS><ICMS10><vICMSST>${item.st}</vICMSST></ICMS10></ICMS>`;
      return `<det nItem="${index + 1}"><prod><cProd>P${index + 1}</cProd><xProd>Produto ${index + 1}</xProd><vProd>10.00</vProd></prod><imposto>${st}${ipi}</imposto></det>`;
    })
    .join("");
  const totals = `${declared.st === undefined ? "" : `<vST>${declared.st}</vST>`}${declared.ipi === undefined ? "" : `<vIPI>${declared.ipi}</vIPI>`}`;
  const protocol = options.cStat
    ? `<protNFe><infProt><cStat>${options.cStat}</cStat></infProt></protNFe>`
    : "";
  return `<nfeProc><NFe><infNFe><ide><mod>55</mod><serie>1</serie><nNF>${number}</nNF></ide><emit><CNPJ>${ISSUER}</CNPJ></emit>${det}<total><ICMSTot>${totals}<vNF>${options.marker ?? "20.00"}</vNF></ICMSTot></total></infNFe></NFe>${protocol}</nfeProc>`;
}

const zip = (files: Record<string, string>) => ({
  file_name: "xml.zip",
  zip_base64: createZip(
    Object.entries(files).map(([fileName, text]) => ({ fileName, body: Buffer.from(text) })),
  ).toString("base64"),
});

const files = {
  "100.xml": nfe("100", [{ ipi: "10.10", st: "1.05" }, { ipi: "0.20" }], {
    ipi: "10.30",
    st: "1.05",
  }),
  "100-copia.xml": nfe("100", [{ ipi: "10.10", st: "1.05" }, { ipi: "0.20" }], {
    ipi: "10.30",
    st: "1.05",
  }),
  "101.xml": nfe("101", [{ ipi: "0.10", st: "2" }], { ipi: "0.20", st: "2.00" }),
  "102-a.xml": nfe("102", [{ ipi: "5.00" }], {}, { marker: "1.00" }),
  "102-b.xml": nfe("102", [{ ipi: "6.00" }], {}, { marker: "2.00" }),
  "103.xml": nfe("103", [{ ipi: "9.00" }], { ipi: "9.00" }, { cStat: "101" }),
  "104.xml": nfe("104", [{ ipi: "1,50" }]),
  "quebrado.xml": "<NFe>",
};

describe("sumXmlTaxes", () => {
  const result = sumXmlTaxes(zip(files));

  it("soma IPI e ICMS ST em centavos e mostra a composição por item", () => {
    expect(result.totals).toEqual({ ipi: "10.40", icms_st: "3.05", notes: 2, items: 3 });
    expect(result.notes.map((note) => [note.entry, note.ipi, note.icms_st])).toEqual([
      ["100.xml", "10.30", "1.05"],
      ["101.xml", "0.10", "2.00"],
    ]);
    expect(result.notes[0]?.items).toEqual([
      { number: "1", code: "P1", description: "Produto 1", ipi: "10.10", icms_st: "1.05" },
      { number: "2", code: "P2", description: "Produto 2", ipi: "0.20", icms_st: null },
    ]);
  });

  it("aponta quando a soma dos itens não bate com o total declarado", () => {
    expect(result.notes[0]?.differences).toEqual([]);
    expect(result.notes[1]?.differences).toEqual(["IPI: itens 0.10 × total declarado 0.20"]);
  });

  it("exclui e sinaliza duplicata, nota não autorizada, XML inválido e cópia idêntica", () => {
    expect(result.excluded).toEqual([
      {
        identity: `${ISSUER}|55|1|102`,
        entries: ["102-a.xml", "102-b.xml"],
        reason: "XML repetido com dados da nota diferentes; nenhuma versão foi somada.",
      },
      {
        identity: `${ISSUER}|55|1|103`,
        entries: ["103.xml"],
        reason: "Protocolo com cStat 101 (não autorizada); não somada.",
      },
    ]);
    expect(result.errors).toEqual([
      { entry: "quebrado.xml", message: "XML inválido." },
      { entry: "104.xml", message: "vIPI inválido no item 1: 1,50." },
    ]);
    expect(result.discarded).toEqual([
      { entry: "100-copia.xml", reason: "Cópia idêntica de 100.xml." },
    ]);
    expect(result.status).toBe("partial");
  });

  it("exporta notas, itens e totais que conferem com o detalhamento", () => {
    const { csv, file_name } = xmlTaxTotalsCsvExport(result);
    expect(file_name).toBe("totais-ipi-icms-st.csv");
    const lines = csv.replace(/^﻿/u, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "Nível;Situação;Identidade;Arquivo;Item;Descrição;IPI;ICMS ST;Observação",
    );
    expect(lines).toContain("Totais;;;;;;10,40;3,05;2 nota(s) e 3 item(ns) somados");
    expect(lines).toContain(
      `Nota;Somada;${ISSUER}|55|1|100;100.xml;;;10,30;1,05;XML sem protocolo de autorização`,
    );
    expect(lines).toContain(`Item;Somado;${ISSUER}|55|1|100;100.xml;2;Produto 2;0,20;;`);
    expect(lines).toContain(
      `Nota;Somada;${ISSUER}|55|1|101;101.xml;;;0,10;2,00;IPI: itens 0.10 × total declarado 0.20 | XML sem protocolo de autorização`,
    );
    expect(lines).toContain("Arquivo;Erro;;104.xml;;;;;vIPI inválido no item 1: 1,50.");
    // A soma das linhas de item bate com a linha de totais.
    const cents = (column: number) =>
      lines
        .filter((line) => line.startsWith("Item;"))
        .reduce(
          (sum, line) =>
            sum + Math.round(Number((line.split(";")[column] || "0").replace(",", ".")) * 100),
          0,
        );
    expect([cents(6), cents(7)]).toEqual([1040, 305]);
  });

  it("cobre variantes de ICMS ST e IPI e recusa valores fora do formato", () => {
    const det = (n: number, imposto: string) =>
      `<det nItem="${n}"><prod><cProd>P${n}</cProd><xProd>Produto ${n}</xProd></prod>${imposto}</det>`;
    const wrap = (number: string, body: string) =>
      `<NFe><infNFe><ide><mod>55</mod><serie>1</serie><nNF>${number}</nNF></ide><emit><CNPJ>${ISSUER}</CNPJ></emit>${body}</infNFe></NFe>`;
    const variants = wrap(
      "300",
      [
        det(1, "<imposto><ICMS><ICMS70><vICMSST>1.11</vICMSST></ICMS70></ICMS></imposto>"),
        det(2, "<imposto><ICMS><ICMSSN201><vICMSST>2.22</vICMSST></ICMSSN201></ICMS></imposto>"),
        // ST retida anteriormente (ICMS60) não é ST destacada na nota.
        det(3, "<imposto><ICMS><ICMS60><vICMSSTRet>9.99</vICMSSTRet></ICMS60></ICMS></imposto>"),
        det(4, "<imposto><IPI><IPINT><CST>53</CST></IPINT></IPI></imposto>"),
        det(5, ""),
        det(6, "<imposto><IPI><IPITrib><vIPI>99999999999.99</vIPI></IPITrib></IPI></imposto>"),
      ].join(""),
    );
    const outcome = sumXmlTaxes(
      zip({
        "300.xml": variants,
        "301.xml": wrap(
          "301",
          det(1, "<imposto><IPI><IPITrib><vIPI>1.005</vIPI></IPITrib></IPI></imposto>"),
        ),
        "302.xml": wrap(
          "302",
          det(1, "<imposto><IPI><IPITrib><vIPI>-1.00</vIPI></IPITrib></IPI></imposto>"),
        ),
      }),
    );
    expect(outcome.notes[0]?.items.map((item) => [item.ipi, item.icms_st])).toEqual([
      [null, "1.11"],
      [null, "2.22"],
      [null, null],
      [null, null],
      [null, null],
      ["99999999999.99", null],
    ]);
    expect(outcome.totals).toMatchObject({ ipi: "99999999999.99", icms_st: "3.33", notes: 1 });
    expect(outcome.errors).toEqual([
      { entry: "301.xml", message: "vIPI inválido no item 1: 1.005." },
      { entry: "302.xml", message: "vIPI inválido no item 1: -1.00." },
    ]);
  });

  it("exclui nota cancelada por evento presente no ZIP", () => {
    const key = "35260811222333000181550010000004001123456781";
    const note = nfe("400", [{ ipi: "4.00" }]).replace("<infNFe>", `<infNFe Id="NFe${key}">`);
    const event = `<procEventoNFe><evento><infEvento><chNFe>${key}</chNFe><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>`;
    const outcome = sumXmlTaxes(zip({ "400.xml": note, "cancelamento.xml": event }));
    expect(outcome.notes).toEqual([]);
    expect(outcome.excluded).toEqual([
      expect.objectContaining({ reason: "Cancelada pelo evento cancelamento.xml; não somada." }),
    ]);
    expect(outcome.totals.ipi).toBe("0.00");
  });

  it("fica completo sem erros nem duplicatas e recusa ZIP ilegível", () => {
    const clean = sumXmlTaxes(zip({ "a.xml": nfe("1", [{ ipi: "0.01" }], { ipi: "0.01" }) }));
    expect(clean.status).toBe("complete");
    expect(clean.totals).toEqual({ ipi: "0.01", icms_st: "0.00", notes: 1, items: 1 });
    expect(() => sumXmlTaxes({ file_name: "x.zip", zip_base64: "bm9wZQ==" })).toThrow(ServiceError);
  });
});
