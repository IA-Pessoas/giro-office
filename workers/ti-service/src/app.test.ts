import { describe, expect, it, vi } from "vitest";
import {
  type CategoryPrisma,
  createTiWorkerApp,
  type TiCategoryService,
  type TiWorkerEnv,
} from "./app.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "c0000000-0000-4000-8000-000000000001";
const TOKEN = "ti-gateway-token";

function env(): TiWorkerEnv {
  return {
    JWT_SECRET: "ti-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(permission = "3"): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-permission": permission,
    "x-auth-modules": JSON.stringify({ ti: 3 }),
  };
}

function service(): TiCategoryService {
  return {
    list: vi.fn(async () => [
      { id: CATEGORY_ID, name: "Notebook", organization_id: ORGANIZATION_ID },
    ]),
    create: vi.fn(async () => ({ id: CATEGORY_ID, name: "Notebook" })),
    update: vi.fn(async () => ({ id: CATEGORY_ID, name: "Desktop" })),
  };
}

describe("ti Worker", () => {
  it("serves health and readiness without authentication", async () => {
    const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as CategoryPrisma;
    const app = createTiWorkerApp({ env: env(), prisma, categoryService: service() });
    expect((await app.request("https://ti.test/health")).status).toBe(200);
    expect((await app.request("https://ti.test/ready")).status).toBe(200);
  });

  it("requires authentication and TI permission for categories", async () => {
    const categoryService = service();
    const app = createTiWorkerApp({ env: env(), categoryService });
    expect((await app.request("https://ti.test/ti/inventory-categories/list")).status).toBe(401);
    expect(
      (await app.request("https://ti.test/ti/inventory-categories/list", { headers: headers("1") }))
        .status,
    ).toBe(403);
    expect(categoryService.list).not.toHaveBeenCalled();
  });

  it("keeps category CRUD scoped to the forwarded organization", async () => {
    const categoryService = service();
    const app = createTiWorkerApp({ env: env(), categoryService });
    const list = await app.request("https://ti.test/ti/inventory-categories/list", {
      headers: headers(),
    });
    const created = await app.request("https://ti.test/ti/inventory-categories", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ name: "Notebook", tag: "hardware" }),
    });
    const updated = await app.request(`https://ti.test/ti/inventory-categories/${CATEGORY_ID}`, {
      method: "PATCH",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    expect(list.status).toBe(200);
    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(categoryService.list).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(categoryService.create).toHaveBeenCalledWith(ORGANIZATION_ID, {
      name: "Notebook",
      tag: "hardware",
    });
    expect(categoryService.update).toHaveBeenCalledWith(ORGANIZATION_ID, CATEGORY_ID, {
      active: false,
    });
  });
});
