import { hashCsrfToken } from "@workspace/runtime";
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
    "x-auth-modules": JSON.stringify({ ti: Number(permission) }),
  };
}

function encode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function signSession(claims: Record<string, unknown>): Promise<string> {
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env().JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${encode(new Uint8Array(signature))}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
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

  it("requires the TI module claim even when the legacy permission is high", async () => {
    const categoryService = service();
    const app = createTiWorkerApp({ env: env(), categoryService });
    const response = await app.request("https://ti.test/ti/inventory-categories/list", {
      headers: {
        ...headers("3"),
        "x-auth-modules": JSON.stringify({ reports: 3 }),
      },
    });

    expect(response.status).toBe(403);
    expect(categoryService.list).not.toHaveBeenCalled();
  });

  it("rejects a direct cookie mutation without CSRF before reaching the service", async () => {
    const categoryService = service();
    const session = await signSession({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      modules: { ti: 3 },
      csrf_hash: await hashCsrfToken("csrf-token"),
    });
    const app = createTiWorkerApp({ env: env(), categoryService });

    const response = await app.request("https://ti.test/ti/inventory-categories", {
      method: "POST",
      headers: {
        cookie: `cw.session=${session}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Notebook" }),
    });

    expect(response.status).toBe(403);
    expect(categoryService.create).not.toHaveBeenCalled();
  });

  it("validates a direct cookie session after CSRF and keeps the mutation available", async () => {
    const csrf = "A".repeat(43);
    const session = await signSession({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      modules: { ti: 3 },
      csrf_hash: await hashCsrfToken(csrf),
    });
    const userService = { fetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })) };
    const categoryService = service();
    const app = createTiWorkerApp({
      env: {
        ...env(),
        USER_SERVICE_INTERNAL_TOKEN: "user-service-token",
        USER_SERVICE: userService,
      } as never,
      categoryService,
    });

    const response = await app.request("https://ti.test/ti/inventory-categories", {
      method: "POST",
      headers: {
        cookie: `cw.session=${session}; cw.csrf=${csrf}`,
        "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Notebook" }),
    });

    expect(response.status).toBe(201);
    expect(userService.fetch).toHaveBeenCalledOnce();
    expect(categoryService.create).toHaveBeenCalledOnce();
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
      {
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        permission: 2,
        isOrganizationOwner: false,
      },
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
      {
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        permission: 3,
        isOrganizationOwner: false,
      },
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
      {
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        permission: 2,
        isOrganizationOwner: false,
      },
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
      {
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        permission: 1,
        isOrganizationOwner: false,
      },
      {},
    );
  });

  it("keeps request transfer available to an owner with TI Viewer", async () => {
    const requests = { assign: vi.fn(async () => ({ id: CATEGORY_ID, assigned_to_id: USER_ID })) };
    const app = createTiWorkerApp({
      env: env(),
      services: { requests },
    } as never);

    const response = await app.request(`https://ti.test/ti/requests/${CATEGORY_ID}/assign`, {
      method: "PATCH",
      headers: {
        ...headers("1"),
        "x-auth-type": "owner",
        "content-type": "application/json",
      },
      body: JSON.stringify({ assigned_to_id: USER_ID }),
    });

    expect(response.status).toBe(200);
    expect(requests.assign).toHaveBeenCalledWith(
      {
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        permission: 1,
        isOrganizationOwner: true,
      },
      CATEGORY_ID,
      { assigned_to_id: USER_ID },
    );
  });

  it("does not expose internal reporting without a valid grant", async () => {
    const response = await appRequestWithoutAuth("https://ti.test/internal/reporting/catalog");
    expect(response.status).toBe(403);
  });

  it("uses the persistent reporting grant replay guard", async () => {
    const now = Math.floor(Date.now() / 1000);
    const grant = {
      version: 1,
      audience: "ti-service",
      operation: "catalog",
      source: "ti.catalog",
      organization_id: ORGANIZATION_ID,
      fields: [],
      request_id: "request-1",
      issued_at: now - 1,
      expires_at: now + 30,
      body_sha256: await sha256Hex(canonicalJson({})),
    };
    const grantValue = encode(canonicalJson(grant));
    const grantUse = {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
    };
    grantUse.create.mockResolvedValueOnce({}).mockRejectedValueOnce({ code: "P2002" });
    const app = createTiWorkerApp({
      env: {
        ...env(),
        REPORTS_INTERNAL_TOKEN: "reports-token",
        REPORTS_GRANT_SECRET: "grant-secret",
      },
      prisma: { reportGrantUse: grantUse } as never,
      services: { reporting: { catalog: vi.fn(async () => ({ sources: [] })) } } as never,
    });
    const requestHeaders = {
      "x-internal-service-token": "reports-token",
      "x-reports-grant": grantValue,
      "x-reports-grant-signature": await hmacHex("grant-secret", grantValue),
      "x-request-id": "request-1",
    };

    expect(
      (await app.request("https://ti.test/internal/reporting/catalog", { headers: requestHeaders }))
        .status,
    ).toBe(200);
    expect(
      (await app.request("https://ti.test/internal/reporting/catalog", { headers: requestHeaders }))
        .status,
    ).toBe(403);
    expect(grantUse.deleteMany).toHaveBeenCalledTimes(2);
    expect(grantUse.create).toHaveBeenCalledTimes(2);
  });

  it("removes an uploaded attachment when message creation fails", async () => {
    const attachment = `ti/organizations/${ORGANIZATION_ID}/requests/${CATEGORY_ID}/00000000-0000-4000-8000-000000000001.png`;
    const storage = {
      upload: vi.fn(async () => attachment),
      remove: vi.fn().mockResolvedValue(undefined),
      createSignedAccessUrl: vi.fn(),
    };
    const requests = {
      createMessage: vi.fn(async () => {
        throw new Error("message failed");
      }),
    };
    const form = new FormData();
    form.set("message", "falha controlada");
    form.set("type", "Message");
    form.set(
      "file",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "a.png", {
        type: "image/png",
      }),
    );
    const app = createTiWorkerApp({
      env: env(),
      services: { requests } as never,
      requestImageStorage: storage,
    } as never);

    const response = await app.request(`https://ti.test/ti/requests/${CATEGORY_ID}/messages`, {
      method: "POST",
      headers: headers("1"),
      body: form,
    });

    expect(response.status).toBe(500);
    expect(storage.remove).toHaveBeenCalledWith(attachment);
  });
});

async function appRequestWithoutAuth(url: string): Promise<Response> {
  return createTiWorkerApp({ env: env() }).request(url);
}
