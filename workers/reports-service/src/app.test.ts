import { describe, expect, it, vi } from "vitest";
import { createReportsWorkerApp } from "./app.js";
import type { ReportsWorkerEnv } from "./env.js";

const env: ReportsWorkerEnv = {
  JWT_SECRET: "reports-test-secret",
  NODE_ENV: "test",
};

function encode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function sign(claims: Record<string, unknown>): Promise<string> {
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${encode(new Uint8Array(signature))}`;
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

function fakePrisma() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe("reports-service Worker", () => {
  it("mantém health/ready e usa Prisma por request no ready", async () => {
    const prisma = fakePrisma();
    const app = createReportsWorkerApp({ env, prisma });

    const health = await app.request("https://reports.test/health");
    const ready = await app.request("https://reports.test/ready");

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({
      success: true,
      data: { status: "ok", service: "reports-service", env: "test" },
    });
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({
      success: true,
      data: { status: "ready", service: "reports-service" },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("exige autenticação no catálogo", async () => {
    const app = createReportsWorkerApp({ env });

    const response = await app.request("https://reports.test/reports/catalog");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ success: false, code: "UNAUTHORIZED" });
  });

  it("expõe somente fontes autorizadas pelo organization_id e pelos módulos do JWT", async () => {
    const token = await sign({
      user_id: "user-1",
      organization_id: "org-1",
      modules: { integracao: 1 },
    });
    const app = createReportsWorkerApp({ env });

    const response = await app.request("https://reports.test/reports/catalog", {
      headers: authHeaders(token),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        items: [expect.objectContaining({ key: "integracao.clients", module: "integracao" })],
      },
    });
  });

  it("valida o fluxo principal de definição sem aceitar fonte fora do escopo", async () => {
    const token = await sign({
      user_id: "user-1",
      organization_id: "org-1",
      modules: { integracao: 1 },
    });
    const app = createReportsWorkerApp({ env });
    const definition = {
      version: 2,
      areas: [{ source: "integracao.clients", fields: ["name"] }],
    };

    const valid = await app.request("https://reports.test/reports/definitions/validate", {
      method: "POST",
      headers: { ...authHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ definition }),
    });
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toEqual({ success: true, data: { definition } });

    const deniedToken = await sign({
      user_id: "user-1",
      organization_id: "org-2",
      modules: { integracao: 0 },
    });
    const denied = await app.request("https://reports.test/reports/definitions/validate", {
      method: "POST",
      headers: { ...authHeaders(deniedToken), "content-type": "application/json" },
      body: JSON.stringify({ definition }),
    });
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" });
  });
});
