import { describe, expect, it, vi } from "vitest";
import {
  type CommercialWorkerEnv,
  createCommercialWorkerApp,
  type ProposalPrisma,
  type ProposalService,
} from "./app.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CONFIG_ID = "c0000000-0000-4000-8000-000000000001";
const TOKEN = "commercial-gateway-token";

function env(): CommercialWorkerEnv {
  return {
    JWT_SECRET: "commercial-worker-test-secret-which-is-long-enough",
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
    "x-auth-modules": JSON.stringify({ comercial: 2 }),
  };
}

function service(): ProposalService {
  return {
    list: vi.fn(async () => [{ id: CONFIG_ID, name: "Mensal", contract_value: 100 }]),
    detail: vi.fn(async () => ({ id: CONFIG_ID, name: "Mensal", contract_value: 100 })),
    create: vi.fn(async () => ({ id: CONFIG_ID, name: "Mensal", contract_value: 100 })),
    update: vi.fn(async () => ({ id: CONFIG_ID, name: "Anual", contract_value: 1200 })),
    delete: vi.fn(async () => ({ id: CONFIG_ID, deleted: true })),
  };
}

describe("commercial Worker", () => {
  it("serves health and readiness", async () => {
    const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as ProposalPrisma;
    const app = createCommercialWorkerApp({ env: env(), prisma, proposalService: service() });
    expect((await app.request("https://commercial.test/health")).status).toBe(200);
    expect((await app.request("https://commercial.test/ready")).status).toBe(200);
  });

  it("reports missing PostgreSQL runtime configuration as unavailable", async () => {
    const app = createCommercialWorkerApp({
      env: {
        JWT_SECRET: env().JWT_SECRET,
        INTERNAL_SERVICE_TOKEN: TOKEN,
      },
    });

    expect((await app.request("https://commercial.test/ready")).status).toBe(503);
  });

  it("requires authentication for proposal configuration routes", async () => {
    const proposalService = service();
    const app = createCommercialWorkerApp({ env: env(), proposalService });
    expect((await app.request("https://commercial.test/commercial/proposal-configs")).status).toBe(
      401,
    );
    expect(proposalService.list).not.toHaveBeenCalled();
  });

  it("keeps proposal configuration CRUD scoped to the organization", async () => {
    const proposalService = service();
    const app = createCommercialWorkerApp({ env: env(), proposalService });
    const list = await app.request("https://commercial.test/commercial/proposal-configs", {
      headers: headers(),
    });
    const created = await app.request("https://commercial.test/commercial/proposal-configs", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ name: "Mensal", contract_value: 100 }),
    });
    const updated = await app.request(
      `https://commercial.test/commercial/proposal-configs/${CONFIG_ID}`,
      {
        method: "PATCH",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ name: "Anual", contract_value: 1200 }),
      },
    );
    expect(list.status).toBe(200);
    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(proposalService.list).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(proposalService.create).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      { name: "Mensal", contract_value: 100 },
      expect.objectContaining({ userId: USER_ID }),
    );
    expect(proposalService.update).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      CONFIG_ID,
      { name: "Anual", contract_value: 1200 },
      expect.objectContaining({ userId: USER_ID }),
    );
  });
});
