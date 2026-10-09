import "./envBootstrap.js";

import {
  createLogger,
  createZip,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createFiscalApp } from "../app.js";
import { getFiscalServiceEnv } from "../config/env.js";

const env = getFiscalServiceEnv();
const logger = createLogger({ service: "fiscal-service", env: env.nodeEnv, level: env.logLevel });

function headers(permission: number) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "a0000000-0000-4000-8000-000000000001",
    [FORWARDED_AUTH_USER_ID_HEADER]: "c0000000-0000-4000-8000-000000000001",
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

const header = "CNPJ Emitente;Modelo;Série;Número;Valor";
const body = {
  dominio: { file_name: "dominio.csv", content: `${header}\n11222333000181;55;1;100;10,00` },
  sefaz: { file_name: "sefaz.csv", content: `${header}\n11222333000181;55;1;100;10,00` },
};

describe("POST /fiscal/conferences/documents", () => {
  // Sem dependências de banco injetadas: a conferência não lê nem grava dados operacionais.
  const app = createFiscalApp({ env, logger });

  it("exige autenticação e nível 2", async () => {
    await request(app).post("/fiscal/conferences/documents").send(body).expect(401);
    const reader = await request(app)
      .post("/fiscal/conferences/documents")
      .set(headers(1))
      .send(body)
      .expect(403);
    expect(reader.body.error).toBe("Permissão insuficiente para alterar dados fiscais.");
  });

  it("devolve o resultado e o CSV de exportação", async () => {
    const response = await request(app)
      .post("/fiscal/conferences/documents")
      .set(headers(2))
      .send(body)
      .expect(200);
    expect(response.body.data).toMatchObject({
      status: "complete",
      summary: { matched: 1, divergent: 0 },
      file_name: "conferencia-dominio-sefaz.csv",
    });
    expect(response.body.data.csv).toContain("Coincidente;11222333000181|55|1|100");
  });

  it("aceita planilha acima do limite JSON padrão", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => `11222333000181;55;1;${i + 1};1,00`);
    const big = { file_name: "dominio.csv", content: [header, ...rows].join("\n") };
    const response = await request(app)
      .post("/fiscal/conferences/documents")
      .set(headers(2))
      .send({ ...body, dominio: big })
      .expect(200);
    expect(response.body.data.summary.only_dominio).toBe(4999);
  });

  it("recusa formato não reconhecido sem gerar relatório", async () => {
    const response = await request(app)
      .post("/fiscal/conferences/documents")
      .set(headers(2))
      .send({ ...body, sefaz: { file_name: "x.csv", content: "Número;Valor\n1;2" } })
      .expect(400);
    expect(response.body.error).toMatch(/Arquivo SEFAZ/u);
    expect(response.body.data).toBeUndefined();

    await request(app)
      .post("/fiscal/conferences/documents")
      .set(headers(2))
      .send({ dominio: body.dominio })
      .expect(400);
  });
});

describe("POST /fiscal/conferences/xml-selection", () => {
  const app = createFiscalApp({ env, logger });
  const nfe = `<NFe><infNFe versao="4.00"><ide><mod>55</mod><serie>1</serie><nNF>100</nNF></ide><emit><CNPJ>11222333000181</CNPJ></emit></infNFe></NFe>`;
  const selection = {
    file_name: "notas.zip",
    zip_base64: createZip([{ fileName: "a.xml", body: Buffer.from(nfe) }]).toString("base64"),
    requests: ["100"],
  };

  it("exige nível 2 e devolve o ZIP com o XML selecionado", async () => {
    await request(app)
      .post("/fiscal/conferences/xml-selection")
      .set(headers(1))
      .send(selection)
      .expect(403);
    const response = await request(app)
      .post("/fiscal/conferences/xml-selection")
      .set(headers(2))
      .send(selection)
      .expect(200);
    expect(response.body.data).toMatchObject({
      status: "complete",
      file_name: "xml-selecionados.zip",
      selected: [{ request: "100", entry: "a.xml" }],
    });
    expect(typeof response.body.data.zip_base64).toBe("string");
  });

  it("recusa base64 inválido e lista vazia", async () => {
    await request(app)
      .post("/fiscal/conferences/xml-selection")
      .set(headers(2))
      .send({ ...selection, zip_base64: "não é base64" })
      .expect(400);
    await request(app)
      .post("/fiscal/conferences/xml-selection")
      .set(headers(2))
      .send({ ...selection, requests: [] })
      .expect(400);
  });
});

describe("POST /fiscal/conferences/sefaz-xml", () => {
  const app = createFiscalApp({ env, logger });
  const nfe = `<NFe><infNFe><ide><mod>55</mod><serie>1</serie><nNF>100</nNF></ide><emit><CNPJ>11222333000181</CNPJ></emit><total><ICMSTot><vNF>10.00</vNF></ICMSTot></total></infNFe></NFe>`;
  const conference = {
    sefaz: { file_name: "sefaz.csv", content: `${header}\n11222333000181;55;1;100;10,00` },
    xml: {
      file_name: "xml.zip",
      zip_base64: createZip([{ fileName: "a.xml", body: Buffer.from(nfe) }]).toString("base64"),
    },
  };

  it("exige nível 2 e devolve a conferência com o CSV", async () => {
    await request(app)
      .post("/fiscal/conferences/sefaz-xml")
      .set(headers(1))
      .send(conference)
      .expect(403);
    const response = await request(app)
      .post("/fiscal/conferences/sefaz-xml")
      .set(headers(2))
      .send(conference)
      .expect(200);
    expect(response.body.data).toMatchObject({
      status: "complete",
      summary: { matched: 1 },
      file_name: "conferencia-sefaz-xml.csv",
    });
    expect(response.body.data.csv).toContain("Coincidente;11222333000181|55|1|100");
  });

  it("recusa ZIP que não é base64", async () => {
    await request(app)
      .post("/fiscal/conferences/sefaz-xml")
      .set(headers(2))
      .send({ ...conference, xml: { file_name: "x.zip", zip_base64: "%%%" } })
      .expect(400);
  });
});

describe("POST /fiscal/conferences/sped-xml", () => {
  const app = createFiscalApp({ env, logger });
  const nfe = `<NFe><infNFe><ide><mod>55</mod><serie>1</serie><nNF>100</nNF></ide><emit><CNPJ>11222333000181</CNPJ></emit><det nItem="1"><prod><cProd>A</cProd><CFOP>5102</CFOP><qCom>1</qCom><vProd>10.00</vProd></prod></det><total><ICMSTot><vNF>10.00</vNF></ICMSTot></total></infNFe></NFe>`;
  const sped = [
    "|0000|017|0|01082026|31082026|EMPRESA|11222333000181||SP|",
    "|C100|0|0||55|00|1|100||01082026|01082026|10,00|",
    "|C170|1|A||1|UN|10,00|0|0|000|5102|",
  ].join("\n");
  const conference = {
    sped: { file_name: "sped.txt", content: sped },
    xml: {
      file_name: "xml.zip",
      zip_base64: createZip([{ fileName: "a.xml", body: Buffer.from(nfe) }]).toString("base64"),
    },
  };

  it("exige nível 2 e devolve documentos e itens conferidos", async () => {
    await request(app)
      .post("/fiscal/conferences/sped-xml")
      .set(headers(1))
      .send(conference)
      .expect(403);
    const response = await request(app)
      .post("/fiscal/conferences/sped-xml")
      .set(headers(2))
      .send(conference)
      .expect(200);
    expect(response.body.data).toMatchObject({
      status: "complete",
      summary: { matched: 1, items_matched: 1 },
      file_name: "conferencia-sped-xml.csv",
    });
  });

  it("recusa arquivo sem C100", async () => {
    await request(app)
      .post("/fiscal/conferences/sped-xml")
      .set(headers(2))
      .send({ ...conference, sped: { file_name: "x.txt", content: "|0000|017|" } })
      .expect(400);
  });
});

describe("POST /fiscal/conferences/xml-taxes", () => {
  const app = createFiscalApp({ env, logger });
  const nfe = `<NFe><infNFe><ide><mod>55</mod><serie>1</serie><nNF>100</nNF></ide><emit><CNPJ>11222333000181</CNPJ></emit><det nItem="1"><prod><cProd>A</cProd></prod><imposto><IPI><IPITrib><vIPI>1.10</vIPI></IPITrib></IPI></imposto></det></infNFe></NFe>`;
  const body = {
    file_name: "xml.zip",
    zip_base64: createZip([{ fileName: "a.xml", body: Buffer.from(nfe) }]).toString("base64"),
  };

  it("exige nível 2 e devolve os totais com o CSV", async () => {
    await request(app).post("/fiscal/conferences/xml-taxes").set(headers(1)).send(body).expect(403);
    const response = await request(app)
      .post("/fiscal/conferences/xml-taxes")
      .set(headers(2))
      .send(body)
      .expect(200);
    expect(response.body.data).toMatchObject({
      status: "complete",
      totals: { ipi: "1.10", icms_st: "0.00", notes: 1, items: 1 },
      file_name: "totais-ipi-icms-st.csv",
    });
  });

  it("recusa ZIP que não é base64", async () => {
    await request(app)
      .post("/fiscal/conferences/xml-taxes")
      .set(headers(2))
      .send({ ...body, zip_base64: "%%%" })
      .expect(400);
  });
});
