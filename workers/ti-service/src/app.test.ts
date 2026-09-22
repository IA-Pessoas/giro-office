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

  it("routes inventory listing with the forwarded organization and pagination", async () => {
    const inventory = { list: vi.fn(async () => [{ id: "asset-1" }]) };
    const app = createTiWorkerApp({
      env: env(),
      services: { inventory },
    } as never);

    const response = await app.request(
      "https://ti.test/ti/inventory/list?page=2&page_size=10&status=available",
      { headers: headers("2") },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: [{ id: "asset-1" }] });
    expect(inventory.list).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      { page: 2, page_size: 10, status: "available" },
    );
  });

  it("keeps password retrieval behind the admin TI permission", async () => {
    const passwords = { getById: vi.fn(async () => ({ id: CATEGORY_ID, password: "clear" })) };
    const app = createTiWorkerApp({
      env: env(),
      services: { passwords },
    } as never);

    expect(
      (await app.request(`https://ti.test/ti/passwords/${CATEGORY_ID}`, { headers: headers("2") }))
        .status,
    ).toBe(403);

    const response = await app.request(`https://ti.test/ti/passwords/${CATEGORY_ID}`, {
      headers: headers("3"),
    });
    expect(response.status).toBe(200);
    expect(passwords.getById).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 3 },
      CATEGORY_ID,
    );
  });

  it("routes request messages through the organization-scoped request service", async () => {
    const requests = { list: vi.fn(async () => [{ id: CATEGORY_ID }]) };
    const app = createTiWorkerApp({
      env: env(),
      services: { requests },
    } as never);

    const response = await app.request("https://ti.test/ti/requests/list?status=New", {
      headers: headers("2"),
    });

    expect(response.status).toBe(200);
    expect(requests.list).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      { status: "New" },
    );
  });

  it("keeps request listing available to TI viewers", async () => {
    const requests = { list: vi.fn(async () => []) };
    const app = createTiWorkerApp({
      env: env(),
      services: { requests },
    } as never);

    const response = await app.request("https://ti.test/ti/requests/list", {
      headers: headers("1"),
    });

    expect(response.status).toBe(200);
    expect(requests.list).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 1 },
      {},
    );
  });

  it("does not expose internal reporting without a valid grant", async () => {
    const response = await appRequestWithoutAuth("https://ti.test/internal/reporting/catalog");
    expect(response.status).toBe(403);
  });
});

async function appRequestWithoutAuth(url: string): Promise<Response> {
  return createTiWorkerApp({ env: env() }).request(url);
}
