import { describe, expect, it, vi } from "vitest";
import {
  createTriagemWorkerApp,
  type TriagemCatalogPrisma,
  type TriagemCatalogService,
  type TriagemWorkerEnv,
} from "./app.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const ITEM_ID = "c0000000-0000-4000-8000-000000000001";
const TOKEN = "triagem-gateway-token";

function env(): TriagemWorkerEnv {
  return {
    JWT_SECRET: "triagem-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(permission = "2"): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-modules": JSON.stringify({ triagem: Number(permission) }),
  };
}

function service(): TriagemCatalogService {
  return {
    list: vi.fn(async () => [{ id: ITEM_ID, kind: "LINK_TYPE", code: "gov", label: "Governo" }]),
    create: vi.fn(async () => ({ id: ITEM_ID, kind: "LINK_TYPE", code: "gov", label: "Governo" })),
    update: vi.fn(async () => ({ id: ITEM_ID, kind: "LINK_TYPE", code: "gov", label: "Governo" })),
    archive: vi.fn(async () => ({ id: ITEM_ID, archived_at: new Date().toISOString() })),
  };
}

describe("triagem Worker", () => {
  it("serves health and readiness", async () => {
    const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as TriagemCatalogPrisma;
    const app = createTriagemWorkerApp({ env: env(), prisma, catalogService: service() });
    expect((await app.request("https://triagem.test/health")).status).toBe(200);
    expect((await app.request("https://triagem.test/ready")).status).toBe(200);
  });

  it("requires authentication and module permission", async () => {
    const catalogService = service();
    const app = createTriagemWorkerApp({ env: env(), catalogService });
    expect((await app.request("https://triagem.test/triagem/catalogs")).status).toBe(401);
    expect(
      (await app.request("https://triagem.test/triagem/catalogs", { headers: headers("0") }))
        .status,
    ).toBe(403);
    expect(catalogService.list).not.toHaveBeenCalled();
  });

  it("keeps catalog CRUD and archive scoped to the organization", async () => {
    const catalogService = service();
    const app = createTriagemWorkerApp({ env: env(), catalogService });
    const list = await app.request("https://triagem.test/triagem/catalogs?kind=LINK_TYPE", {
      headers: headers(),
    });
    const created = await app.request("https://triagem.test/triagem/catalogs", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ kind: "LINK_TYPE", code: "gov", label: "Governo" }),
    });
    const updated = await app.request(`https://triagem.test/triagem/catalogs/${ITEM_ID}`, {
      method: "PATCH",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ label: "Governo Federal" }),
    });
    const archived = await app.request(`https://triagem.test/triagem/catalogs/${ITEM_ID}/archive`, {
      method: "PATCH",
      headers: headers(),
    });
    expect(list.status).toBe(200);
    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(archived.status).toBe(200);
    expect(catalogService.list).toHaveBeenCalledWith(ORGANIZATION_ID, {
      kind: "LINK_TYPE",
      include_archived: false,
    });
    expect(catalogService.create).toHaveBeenCalledWith(ORGANIZATION_ID, {
      kind: "LINK_TYPE",
      code: "gov",
      label: "Governo",
    });
    expect(catalogService.update).toHaveBeenCalledWith(ORGANIZATION_ID, ITEM_ID, {
      label: "Governo Federal",
    });
    expect(catalogService.archive).toHaveBeenCalledWith(ORGANIZATION_ID, ITEM_ID);
  });
});
