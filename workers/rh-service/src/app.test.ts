import { describe, expect, it, vi } from "vitest";
import {
  createRhWorkerApp,
  type RhCategoryPrisma,
  type RhCategoryService,
  type RhNotificationService,
  type RhWorkerEnv,
} from "./app.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "c0000000-0000-4000-8000-000000000001";
const TOKEN = "rh-gateway-token";

function env(): RhWorkerEnv {
  return {
    JWT_SECRET: "rh-worker-test-secret-which-is-long-enough",
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
  };
}

function service(): RhCategoryService {
  return {
    list: vi.fn(async () => [{ id: CATEGORY_ID, name: "Férias", active: true }]),
    create: vi.fn(async () => ({ id: CATEGORY_ID, name: "Férias", active: true })),
    update: vi.fn(async () => ({ id: CATEGORY_ID, name: "Folga", active: true })),
  };
}

function notificationService(): RhNotificationService {
  return {
    list: vi.fn(async () => [{ id: "notification-1", read: false }]),
    markRead: vi.fn(async () => ({ count: 1 })),
  };
}

describe("rh Worker", () => {
  it("serves health and readiness", async () => {
    const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as RhCategoryPrisma;
    const app = createRhWorkerApp({ env: env(), prisma, categoryService: service() });
    expect((await app.request("https://rh.test/health")).status).toBe(200);
    expect((await app.request("https://rh.test/ready")).status).toBe(200);
  });

  it("requires authentication and RH permission", async () => {
    const categoryService = service();
    const app = createRhWorkerApp({ env: env(), categoryService });
    expect((await app.request("https://rh.test/rh/categories")).status).toBe(401);
    expect(
      (await app.request("https://rh.test/rh/categories", { headers: headers("0") })).status,
    ).toBe(403);
    expect(categoryService.list).not.toHaveBeenCalled();
  });

  it("keeps category operations scoped to the forwarded organization", async () => {
    const categoryService = service();
    const app = createRhWorkerApp({ env: env(), categoryService });
    const list = await app.request("https://rh.test/rh/categories?activeOnly=true", {
      headers: headers("1"),
    });
    const created = await app.request("https://rh.test/rh/categories", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ name: "Férias", active: true }),
    });
    const updated = await app.request("https://rh.test/rh/categories", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id: CATEGORY_ID, active: false }),
    });
    expect(list.status).toBe(200);
    expect(created.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(categoryService.list).toHaveBeenCalledWith(ORGANIZATION_ID, true);
    expect(categoryService.create).toHaveBeenCalledWith(ORGANIZATION_ID, {
      name: "Férias",
      active: true,
    });
    expect(categoryService.update).toHaveBeenCalledWith(ORGANIZATION_ID, {
      id: CATEGORY_ID,
      active: false,
    });
  });

  it("lists and marks RH notifications for the authenticated user", async () => {
    const rhNotificationService = notificationService();
    const app = createRhWorkerApp({ env: env(), notificationService: rhNotificationService });
    const list = await app.request("https://rh.test/rh/notifications", { headers: headers("1") });
    const read = await app.request("https://rh.test/rh/notifications/read", {
      method: "PUT",
      headers: { ...headers("1"), "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    });

    expect([list.status, read.status]).toEqual([200, 200]);
    expect(rhNotificationService.list).toHaveBeenCalledWith(ORGANIZATION_ID, USER_ID);
    expect(rhNotificationService.markRead).toHaveBeenCalledWith({
      organization_id: ORGANIZATION_ID,
      user_id: USER_ID,
      all: true,
    });
  });
});
