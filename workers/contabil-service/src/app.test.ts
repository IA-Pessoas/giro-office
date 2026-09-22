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
});
