import { createZip } from "@workspace/shared";
import { readZipEntries } from "@workspace/shared/testUtils";
import { describe, expect, it } from "vitest";

import { parseNfeXml } from "../services/nfeXml.js";
import { selectXmlFromZip } from "../services/xmlSelectionService.js";

function accessKey(issuer: string, series: string, number: string, model = "55"): string {
  const base = `352608${issuer}${model}${series.padStart(3, "0")}${number.padStart(9, "0")}112345678`;
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

function nfe(issuer: string, series: string, number: string, withKey = true): string {
  const id = withKey ? ` Id="NFe${accessKey(issuer, series, number)}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe versao="4.00"${id}>
    <ide><cUF>35</cUF><mod>55</mod><serie>${series}</serie><nNF>${number}</nNF></ide>
    <emit><CNPJ>${issuer}</CNPJ><xNome>Emitente &amp; Cia</xNome></emit>
    <total><ICMSTot><vNF>10.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;
}

const zipOf = (files: Record<string, string>) =>
  createZip(
    Object.entries(files).map(([fileName, text]) => ({
      fileName,
      body: Buffer.from(text, "utf8"),
    })),
  ).toString("base64");

describe("parseNfeXml", () => {
  it("extrai chave e identidade composta da NF-e", () => {
    expect(parseNfeXml(nfe(ISSUER_A, "1", "100"))).toEqual({
      content: expect.stringContaining("<nNF>100</nNF>"),
      value: "10.00",
      protocol_status: null,
      kind: "nfe",
      access_key: accessKey(ISSUER_A, "1", "100"),
      issuer: ISSUER_A,
      model: "55",
      series: "1",
      number: "100",
      identity: `${ISSUER_A}|55|1|100`,
    });
    expect(parseNfeXml(nfe(ISSUER_A, "2", "7", false))).toMatchObject({
      kind: "nfe",
      access_key: null,
      identity: `${ISSUER_A}|55|2|7`,
    });
  });

  it("separa XML malformado, que não é NF-e ou com chave incoerente", () => {
    expect(parseNfeXml("<NFe><infNFe></NFe>")).toEqual({
      kind: "invalid",
      message: "XML inválido.",
    });
    expect(parseNfeXml("<!DOCTYPE x [<!ENTITY a 'b'>]><x/>")).toEqual({
      kind: "invalid",
      message: "XML inválido.",
    });
    expect(parseNfeXml("<procEventoNFe><evento/></procEventoNFe>")).toEqual({
      kind: "other",
      message: "XML não é uma NF-e (sem infNFe).",
    });
    const wrong = nfe(ISSUER_A, "1", "100").replace("<nNF>100</nNF>", "<nNF>101</nNF>");
    expect(parseNfeXml(wrong)).toEqual({
      kind: "invalid",
      message: "Chave de acesso não confere com emitente, modelo, série e número do XML.",
    });
  });
});

describe("parseNfeXml — variações", () => {
  it("aceita prefixo de namespace, NFC-e modelo 65 e XML em ISO-8859-1", () => {
    const key = accessKey(ISSUER_A, "3", "9", "65");
    const prefixed = `<nfe:NFe xmlns:nfe="http://www.portalfiscal.inf.br/nfe"><nfe:infNFe Id="NFe${key}"><nfe:ide><nfe:mod>65</nfe:mod><nfe:serie>3</nfe:serie><nfe:nNF>9</nfe:nNF></nfe:ide><nfe:emit><nfe:CNPJ>${ISSUER_A}</nfe:CNPJ></nfe:emit></nfe:infNFe></nfe:NFe>`;
    expect(parseNfeXml(prefixed)).toMatchObject({ kind: "nfe", identity: `${ISSUER_A}|65|3|9` });
    const latin1 = Buffer.from(nfe(ISSUER_A, "1", "5").replace("Cia", "Ação"), "latin1");
    expect(parseNfeXml(latin1.toString("utf8"))).toMatchObject({ kind: "nfe", number: "5" });
  });

  it("recusa comentário sem fechamento em tempo linear", () => {
    const started = Date.now();
    expect(parseNfeXml(`<NFe>${"<!--".repeat(200_000)}`)).toEqual({
      kind: "invalid",
      message: "XML inválido.",
    });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("selectXmlFromZip", () => {
  const files = {
    "a-100.xml": nfe(ISSUER_A, "1", "100"),
    "b-100.xml": nfe(ISSUER_B, "1", "100"),
    "a-101.xml": nfe(ISSUER_A, "1", "101"),
    "a-102-s2.xml": nfe(ISSUER_A, "2", "102", false),
    "leiame.txt": "não é xml",
    "evento.xml": "<procEventoNFe/>",
    "quebrado.xml": "<NFe>",
  };

  it("seleciona só o que é inequívoco e relata ambíguos, ausentes e descartes", () => {
    const result = selectXmlFromZip({
      file_name: "notas.zip",
      zip_base64: zipOf(files),
      requests: [
        "100",
        `${ISSUER_B};1;100`,
        "101",
        "000101",
        accessKey(ISSUER_A, "1", "100"),
        "2;102",
        "999",
        "abc",
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.selected.map((item) => [item.request, item.entry])).toEqual([
      [`${ISSUER_B};1;100`, "b-100.xml"],
      ["101", "a-101.xml"],
      [accessKey(ISSUER_A, "1", "100"), "a-100.xml"],
      ["2;102", "a-102-s2.xml"],
    ]);
    expect(result.ambiguous).toEqual([
      {
        request: "100",
        reason: "Mais de uma nota com este número; informe emitente, série ou a chave de acesso.",
        candidates: [
          { entry: "a-100.xml", identity: `${ISSUER_A}|55|1|100` },
          { entry: "b-100.xml", identity: `${ISSUER_B}|55|1|100` },
        ],
      },
    ]);
    expect(result.not_found).toEqual([{ request: "999" }]);
    expect(result.invalid_requests).toEqual([
      {
        request: "abc",
        reason:
          "Use a chave de acesso (44 dígitos) ou número, série;número, emitente;série;número ou emitente;modelo;série;número.",
      },
    ]);
    // Pedido repetido é relatado à parte e não torna a seleção parcial por si só.
    expect(result.repeated_requests).toEqual(["000101"]);
    expect(result.archive).toMatchObject({
      file_name: "notas.zip",
      entries: 7,
      nfe_entries: 4,
      discarded: [
        { entry: "leiame.txt", reason: "Não é arquivo .xml." },
        { entry: "evento.xml", reason: "XML não é uma NF-e (sem infNFe)." },
      ],
      errors: [{ entry: "quebrado.xml", message: "XML inválido." }],
      duplicates: [],
    });

    const zipped = readZipEntries(Buffer.from(result.zip_base64 ?? "", "base64"));
    expect([...zipped.keys()].sort()).toEqual(
      [
        `${accessKey(ISSUER_B, "1", "100")}.xml`,
        `${accessKey(ISSUER_A, "1", "101")}.xml`,
        `${accessKey(ISSUER_A, "1", "100")}.xml`,
        `${ISSUER_A}-55-2-102.xml`,
        "relatorio-selecao.csv",
      ].sort(),
    );
    expect(zipped.get(`${accessKey(ISSUER_A, "1", "101")}.xml`)?.toString()).toBe(
      files["a-101.xml"],
    );
    const csv = zipped.get("relatorio-selecao.csv")?.toString() ?? "";
    expect(csv).toBe(result.csv);
    expect(csv).toContain("Selecionada;101;a-101.xml;");
    expect(csv).toContain("Ambígua;100;a-100.xml, b-100.xml;");
    expect(csv).toContain("Totais;;;;;4 selecionada(s), 1 ambígua(s), 1 não encontrada(s)");
    expect(csv).toContain("Pedido repetido;000101;");
  });

  it("não escolhe entre cópias diferentes da mesma nota, mas aceita cópia idêntica", () => {
    const original = nfe(ISSUER_A, "1", "100");
    const result = selectXmlFromZip({
      file_name: "n.zip",
      zip_base64: zipOf({
        "x.xml": original,
        "copia.xml": original,
        "y.xml": nfe(ISSUER_A, "1", "101"),
        "y-alterado.xml": nfe(ISSUER_A, "1", "101").replace("10.00", "11.00"),
      }),
      requests: ["100", "101"],
    });
    expect(result.selected.map((item) => item.entry)).toEqual(["x.xml"]);
    expect(result.ambiguous[0]).toMatchObject({
      request: "101",
      reason: "XML repetido no ZIP com dados da nota (infNFe) diferentes.",
    });
    expect(result.archive.duplicates).toEqual([
      { identity: `${ISSUER_A}|55|1|100`, entries: ["x.xml", "copia.xml"], identical: true },
      { identity: `${ISSUER_A}|55|1|101`, entries: ["y.xml", "y-alterado.xml"], identical: false },
    ]);
    expect(result.status).toBe("partial");
  });

  it("trata NF-e com e sem protocolo como a mesma nota", () => {
    const bare = nfe(ISSUER_A, "1", "100");
    const withoutProtocol = bare.replace(/<\/?nfeProc[^>]*>/gu, "");
    const result = selectXmlFromZip({
      file_name: "n.zip",
      zip_base64: zipOf({ "proc.xml": bare, "nfe.xml": withoutProtocol }),
      requests: ["100", "100"],
    });
    expect(result.selected.map((item) => item.entry)).toEqual(["proc.xml"]);
    expect(result.archive.duplicates[0]?.identical).toBe(true);
    expect(result.status).toBe("complete");
  });

  it("fica completo quando todo pedido foi selecionado e o ZIP não tem problemas", () => {
    const result = selectXmlFromZip({
      file_name: "n.zip",
      zip_base64: zipOf({ "a.xml": nfe(ISSUER_A, "1", "100") }),
      requests: ["100"],
    });
    expect(result.status).toBe("complete");
    expect(result.file_name).toBe("xml-selecionados.zip");
  });

  it("não gera ZIP quando nada foi selecionado", () => {
    const result = selectXmlFromZip({
      file_name: "n.zip",
      zip_base64: zipOf({ "a.xml": nfe(ISSUER_A, "1", "100") }),
      requests: ["5"],
    });
    expect(result.zip_base64).toBeNull();
    expect(result.not_found).toEqual([{ request: "5" }]);
  });

  it("recusa base64 que não é ZIP", () => {
    expect(() =>
      selectXmlFromZip({ file_name: "n.zip", zip_base64: "bm9wZQ==", requests: ["1"] }),
    ).toThrow(/ZIP inválido/u);
  });
});
