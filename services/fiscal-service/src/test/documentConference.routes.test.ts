import "./envBootstrap.js";

import {
  createLogger,
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
