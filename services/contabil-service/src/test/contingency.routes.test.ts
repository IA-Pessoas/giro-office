import { contingencyDatabase } from "./contingencyReviewFixtures.js";
import "./envBootstrap.js";
import { createLogger } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
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
  const { prisma } = contingencyDatabase();
  return createContabilApp({
    env: getContabilServiceEnv(),
    logger: createLogger({ service: "test" }),
    contingencyService: new ContingencyService(prisma as never),
  });
}

describe("POST /contabil/contingency", () => {
  it("protege revisão e exportação por hash, edição e organização", async () => {
    const app = setup();
    const calculated = await request(app)
      .post("/contabil/contingency")
      .query(query)
      .set(headers())
      .send(contingencyXls());
    const { id, content_hash } = calculated.body.data;
    const jsonHeaders = { ...headers(), "content-type": "application/json" };
    const reviewPath = `/contabil/contingency/${id}/review`;
    const exportPath = `/contabil/contingency/${id}/export`;
    expect((await request(app).get(exportPath).query({ content_hash }).set(headers())).status).toBe(
      409,
    );
    expect(
      (await request(app).post(reviewPath).set(jsonHeaders).send({ content_hash })).status,
    ).toBe(200);
    const printed = await request(app).get(exportPath).query({ content_hash }).set(headers());
    expect(printed.status).toBe(200);
    expect(printed.headers["content-type"]).toContain("text/html");
    expect(printed.headers["content-disposition"]).toContain("attachment");
    expect(printed.headers["cache-control"]).toBe("no-store");
    expect(printed.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(printed.text).toContain(content_hash);
    expect((await request(app).post(reviewPath).send({ content_hash })).status).toBe(401);
    expect(
      (
        await request(app)
          .post(reviewPath)
          .set({ ...jsonHeaders, "x-auth-permission": "1" })
          .send({ content_hash })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get(exportPath).query({ content_hash }).set(headers("1"))).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get(exportPath)
          .query({ content_hash })
          .set(headers("2", "organization-b"))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(reviewPath)
          .set(jsonHeaders)
          .send({ content_hash, reviewed_by: "forged" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(reviewPath)
          .set(jsonHeaders)
          .send({ content_hash: "f".repeat(64) })
      ).status,
    ).toBe(409);
    expect(
      (await request(app).get(exportPath).query({ content_hash: "bad" }).set(headers())).status,
    ).toBe(400);
  });

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
