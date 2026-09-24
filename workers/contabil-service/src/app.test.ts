import { describe, expect, it, vi } from "vitest";
import { type ContabilWorkerEnv, createContabilWorkerApp } from "./app.js";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOKEN = "contabil-internal-token";

function env(): ContabilWorkerEnv {
  return {
    JWT_SECRET: "contabil-worker-secret",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER,
    "x-auth-organization-id": ORG,
    "x-auth-kind": "organization",
    "x-auth-modules": JSON.stringify({ contabil: 2 }),
  };
}

describe("contabil Worker", () => {
  it("returns health and readiness envelopes", async () => {
    const prisma = { $queryRaw: vi.fn(async () => [{ ok: 1 }]) };
    const app = createContabilWorkerApp({ env: env(), prisma });
    expect(await (await app.request("https://contabil.test/health")).json()).toEqual({
      success: true,
      data: { status: "ok", service: "contabil-service" },
    });
    expect(await (await app.request("https://contabil.test/ready")).json()).toEqual({
      success: true,
      data: { status: "ready", service: "contabil-service" },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("requires authentication and preserves organization scope", async () => {
    const controlService = { list: vi.fn(async () => ({ competence: "2026-09", items: [] })) };
    const app = createContabilWorkerApp({ env: env(), controlService });
    expect(
      (await app.request("https://contabil.test/contabil/controls/list?competence=2026-09")).status,
    ).toBe(401);
    const response = await app.request(
      "https://contabil.test/contabil/controls/list?competence=2026-09",
      { headers: headers() },
    );
    expect(response.status).toBe(200);
    expect(controlService.list).toHaveBeenCalledWith("2026-09", ORG);
  });

  it("rejects invalid competence before calling the service", async () => {
    const controlService = { list: vi.fn() };
    const app = createContabilWorkerApp({ env: env(), controlService });
    const response = await app.request(
      "https://contabil.test/contabil/controls/list?competence=bad",
      { headers: headers() },
    );
    expect(response.status).toBe(400);
    expect(controlService.list).not.toHaveBeenCalled();
  });

  it("mantém o guard 503 quando não há Hyperdrive nem DATABASE_URL", async () => {
    const app = createContabilWorkerApp({ env: { ...env(), HYPERDRIVE: undefined } });
    const response = await app.request(
      "https://contabil.test/contabil/controls/list?competence=2026-09",
      { headers: headers() },
    );

    expect(response.status).toBe(503);
  });
});

describe("contabil Worker — OpenAPI docs", () => {
  const app = (extra: Partial<ContabilWorkerEnv>) =>
    createContabilWorkerApp({ env: { ...env(), ...extra } });

  it("serve /openapi.json e /docs com ENABLE_API_DOCS fora de produção", async () => {
    const docsApp = app({ ENABLE_API_DOCS: "true" });
    const spec = await docsApp.request("https://contabil.test/openapi.json");
    expect(spec.status).toBe(200);
    expect(((await spec.json()) as { paths: Record<string, unknown> }).paths).toHaveProperty(
      "/contabil/controls/list",
    );
    const docs = await docsApp.request("https://contabil.test/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
    const html = await docs.text();
    expect(html).toContain("<title>contabil-service — OpenAPI</title>");
    expect(html).toContain('url: "/openapi.json"');
  });

  it.each([
    {},
    { ENABLE_API_DOCS: "false" },
    { ENABLE_API_DOCS: "true", NODE_ENV: "production" },
  ])("oculta /openapi.json e /docs com %o", async (extra) => {
    const docsApp = app(extra);
    expect((await docsApp.request("https://contabil.test/openapi.json")).status).toBe(404);
    expect((await docsApp.request("https://contabil.test/docs")).status).toBe(404);
  });
});
