import { describe, expect, it } from "vitest";
import { ContingencyService } from "../../../services/contabil-service/src/services/contingencyService.js";
import { contingencyXls } from "../../../services/contabil-service/src/test/contingencyFixtures.js";
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
  it("executa o mesmo cálculo e recusa cliente de outra organização", async () => {
    const service = new ContingencyService({
      client: {
        findFirst: async ({ where }: { where: { organization_id: string } }) =>
          where.organization_id === "organization-a"
            ? {
                name: "Empresa Sintética",
                company_name: null,
                cpf_cnpj: "11222333000181",
                contabil: true,
              }
            : null,
      },
    } as never);
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
