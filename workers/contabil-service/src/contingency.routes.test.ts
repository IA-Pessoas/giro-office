import { describe, expect, it } from "vitest";
import { ContingencyService } from "../../../services/contabil-service/src/services/contingencyService.js";
import { contingencyXls } from "../../../services/contabil-service/src/test/contingencyFixtures.js";
import { contingencyDatabase } from "../../../services/contabil-service/src/test/contingencyReviewFixtures.js";
import { createContabilWorkerApp } from "./app.js";

const env = { JWT_SECRET: "fixture-secret", INTERNAL_SERVICE_TOKEN: "fixture-internal" };
const headers = (permission = 2, organizationId = "organization-a") => ({
  "x-internal-service-token": env.INTERNAL_SERVICE_TOKEN,
  "x-auth-user-id": "actor",
  "x-auth-organization-id": organizationId,
  "x-auth-modules": JSON.stringify({ contabil: permission }),
  "content-type": "application/vnd.ms-excel",
});
const query = new URLSearchParams({
  client_id: "b0000000-0000-4000-8000-000000000001",
  company_name: "Empresa Sintética",
  cnpj: "11222333000181",
  period_start: "2026-01",
  period_end: "2026-06",
  regime: "Simples Nacional",
  annex: "III",
  filename: "balancete.xls",
});

describe("Contingência no Worker", () => {
  it("recusa JSON malformado de revisão como erro de entrada", async () => {
    const app = createContabilWorkerApp({ env });
    const response = await app.request(
      "/contabil/contingency/b0000000-0000-4000-8000-000000000001/review",
      {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: "{",
      },
    );
    expect(response.status).toBe(400);
  });
  it("revisa e exporta somente o conteúdo atual da organização com edição", async () => {
    const service = new ContingencyService(contingencyDatabase().prisma);
    const app = createContabilWorkerApp({ env, contingencyService: service });
    const calculated = await app.request("/contabil/contingency?" + query, {
      method: "POST",
      headers: headers(),
      body: contingencyXls(),
    });
    const { data } = (await calculated.json()) as { data: { id: string; content_hash: string } };
    const reviewPath = `/contabil/contingency/${data.id}/review`;
    const exportPath = `/contabil/contingency/${data.id}/export?content_hash=${data.content_hash}`;
    expect((await app.request(exportPath, { headers: headers() })).status).toBe(409);
    const review = await app.request(reviewPath, {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ content_hash: data.content_hash }),
    });
    expect(review.status).toBe(200);
    expect(await review.json()).toMatchObject({
      data: { reviewed_by: "actor", reviewed_hash: data.content_hash },
    });
    const exported = await app.request(exportPath, { headers: headers() });
    expect(exported.status).toBe(200);
    expect(exported.headers.get("cache-control")).toBe("no-store");
    expect(exported.headers.get("content-disposition")).toContain("attachment");
    expect(exported.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await exported.text()).toContain("3.982,00");
    expect((await app.request(exportPath, { headers: headers(2, "organization-b") })).status).toBe(
      404,
    );
    expect((await app.request(exportPath, { headers: headers(1) })).status).toBe(403);
    expect((await app.request(reviewPath, { method: "POST", headers: headers(1) })).status).toBe(
      403,
    );
    expect(
      (
        await app.request(reviewPath, {
          method: "POST",
          headers: { ...headers(), "content-type": "application/json" },
          body: '{"content_hash":"bad"}',
        })
      ).status,
    ).toBe(400);
  });

  it("executa o mesmo cálculo e recusa cliente de outra organização", async () => {
    const service = new ContingencyService(contingencyDatabase().prisma);
    const app = createContabilWorkerApp({ env, contingencyService: service });
    const response = await app.request("/contabil/contingency?" + query, {
      method: "POST",
      headers: headers(),
      body: contingencyXls(),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      success: true,
      data: { minimum: { totalCents: 398200 }, identity: "matched" },
    });
    const denied = await app.request("/contabil/contingency?" + query, {
      method: "POST",
      headers: headers(2, "organization-b"),
      body: contingencyXls(),
    });
    expect(denied.status).toBe(404);
  });

  it("valida autenticação, edição, parâmetros, mídia e tamanho antes de acessar o banco", async () => {
    const app = createContabilWorkerApp({ env });
    expect((await app.request("/contabil/contingency", { method: "POST" })).status).toBe(401);
    expect(
      (await app.request("/contabil/contingency", { method: "POST", headers: headers(1) })).status,
    ).toBe(403);
    expect(
      (
        await app.request("/contabil/contingency?" + query + "&organization_id=forged", {
          method: "POST",
          headers: headers(),
          body: "bad",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request("/contabil/contingency?" + query, {
          method: "POST",
          headers: { ...headers(), "content-type": "text/plain" },
          body: "bad",
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await app.request("/contabil/contingency?" + query, {
          method: "POST",
          headers: headers(),
          body: new Uint8Array(5 * 1024 * 1024 + 1),
        })
      ).status,
    ).toBe(413);
  });
});
