import "./envBootstrap.js";
import { createLogger } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createContabilApp } from "../app.js";
import { getContabilServiceEnv } from "../config/env.js";
import { ContingencyService } from "../services/contingencyService.js";
import { contingencyXls } from "./contingencyFixtures.js";

const query = {
  client_id: "b0000000-0000-4000-8000-000000000001",
  company_name: "Empresa Sintética",
  cnpj: "11222333000181",
  period_start: "2026-01",
  period_end: "2026-06",
  regime: "Simples Nacional",
  annex: "III",
  filename: "balancete.xls",
};
const headers = (permission = "2", organization = "organization-a") => ({
  "x-internal-service-token": "audit-service-token",
  "x-auth-user-id": "actor",
  "x-auth-organization-id": organization,
  "x-auth-permission": permission,
  "content-type": "application/vnd.ms-excel",
});

function setup() {
  const prisma = {
    client: {
      findFirst: vi.fn(async ({ where }) =>
        where.organization_id === "organization-a"
          ? {
              name: "Empresa Sintética",
              company_name: null,
              cpf_cnpj: "11222333000181",
              contabil: true,
            }
          : null,
      ),
    },
  };
  return createContabilApp({
    env: getContabilServiceEnv(),
    logger: createLogger({ service: "test" }),
    contingencyService: new ContingencyService(prisma as never),
  });
}

describe("POST /contabil/contingency", () => {
  it("recebe XLS e retorna simulação privada com valores e origens", async () => {
    const response = await request(setup())
      .post("/contabil/contingency")
      .query(query)
      .set(headers())
      .send(contingencyXls());
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      success: true,
      data: {
        parameters: { ...query, rate: 11 },
        classification: "legacy_hypothesis",
        minimum: { totalCents: 398200 },
        identity: "matched",
      },
    });
  });

  it("aplica autenticação, permissão e escopo de organização", async () => {
    const app = setup();
    expect((await request(app).post("/contabil/contingency")).status).toBe(401);
    expect((await request(app).post("/contabil/contingency").set(headers("1"))).status).toBe(403);
    expect(
      (
        await request(app)
          .post("/contabil/contingency")
          .query(query)
          .set(headers("2", "organization-b"))
          .send(contingencyXls())
      ).status,
    ).toBe(404);
  });

  it("recusa contexto forjado, arquivo falso, mídia incorreta e excesso de tamanho", async () => {
    const app = setup();
    expect(
      (
        await request(app)
          .post("/contabil/contingency")
          .query({ ...query, organization_id: "forged" })
          .set(headers())
          .send(contingencyXls())
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/contabil/contingency")
          .query(query)
          .set(headers())
          .send(Buffer.from("não é XLS"))
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/contabil/contingency")
          .query(query)
          .set(headers())
          .set("content-type", "text/html")
          .send("xls")
      ).status,
    ).toBe(415);
    expect(
      (
        await request(app)
          .post("/contabil/contingency")
          .query(query)
          .set(headers())
          .send(Buffer.alloc(5 * 1024 * 1024 + 1))
      ).status,
    ).toBe(413);
  });
});
