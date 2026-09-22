import { describe, expect, it, vi } from "vitest";
import {
  createRegularizeWorkerApp,
  type RegularizeLicensePrisma,
  type RegularizeLicenseService,
  type RegularizeWorkerEnv,
} from "./app.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const LICENSE_ID = "c0000000-0000-4000-8000-000000000001";
const TOKEN = "regularize-gateway-token";

function env(): RegularizeWorkerEnv {
  return {
    JWT_SECRET: "regularize-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
  };
}

function service(): RegularizeLicenseService {
  return {
    list: vi.fn(async () => ({ data: [{ id: LICENSE_ID, status: "Em Andamento" }], total: 1 })),
    detail: vi.fn(async () => ({ id: LICENSE_ID, status: "Em Andamento" })),
  };
}

describe("regularize Worker", () => {
  it("serves health and readiness", async () => {
    const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as RegularizeLicensePrisma;
    const app = createRegularizeWorkerApp({ env: env(), prisma, licenseService: service() });
    expect((await app.request("https://regularize.test/health")).status).toBe(200);
    expect((await app.request("https://regularize.test/ready")).status).toBe(200);
  });

  it("requires authentication for license reads", async () => {
    const licenseService = service();
    const app = createRegularizeWorkerApp({ env: env(), licenseService });
    expect(
      (await app.request("https://regularize.test/regularize/licenses?status=Todos")).status,
    ).toBe(401);
    expect(licenseService.list).not.toHaveBeenCalled();
  });

  it("keeps list and detail scoped to the authenticated organization", async () => {
    const licenseService = service();
    const app = createRegularizeWorkerApp({ env: env(), licenseService });
    const list = await app.request(
      "https://regularize.test/regularize/licenses?status=Todos&page=2&limit=10",
      {
        headers: headers(),
      },
    );
    const detail = await app.request(
      `https://regularize.test/regularize/license?id=${LICENSE_ID}`,
      {
        headers: headers(),
      },
    );
    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    expect(licenseService.list).toHaveBeenCalledWith(ORGANIZATION_ID, "Todos", 2, 10, true);
    expect(licenseService.detail).toHaveBeenCalledWith(ORGANIZATION_ID, LICENSE_ID);
  });
});
