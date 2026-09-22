import { describe, expect, it, vi } from "vitest";
import { hashCsrfToken } from "../../runtime/src/session.js";
import { createUserWorkerApp, type UserWorkerEnv } from "./app.js";

const JWT_SECRET = "user-worker-test-secret-with-enough-length";
const INTERNAL_TOKEN = "user-worker-internal-token";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const PLATFORM_USER_ID = "p0000000-0000-4000-8000-000000000001";

function env(): UserWorkerEnv {
  return {
    JWT_SECRET,
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    AUTH_COOKIE_SECURE: false,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function prisma() {
  return {
    user: {
      findFirst: vi.fn(async () => user()),
      findMany: vi.fn(async () => [user()]),
      count: vi.fn(async () => 1),
    },
    permission: {
      findFirst: vi.fn(async () => permission()),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    permissionSpecific: { findFirst: vi.fn(async () => ({ task_completion: true })) },
    authSession: {
      findFirst: vi.fn(async () => ({
        csrf_hash: "a".repeat(64),
        user: { session_version: 1, organization_id: ORGANIZATION_ID, status: "active" },
      })),
    },
    platformAuthSession: {
      findFirst: vi.fn(async () => ({
        csrf_hash: "b".repeat(64),
        platformUser: {
          id: PLATFORM_USER_ID,
          name: "Platform",
          email: "platform@example.com",
          platform_role: "super_admin",
          status: "active",
          session_version: 1,
        },
      })),
    },
    department: { findMany: vi.fn(async () => [{ id: "dep-1", name: "Tecnologia" }]) },
    $disconnect: vi.fn(async () => {}),
  };
}

function user() {
  return {
    id: USER_ID,
    name: "Usuário",
    login: "usuario@example.com",
    permission: 2,
    status: "active",
    department_id: "dep-1",
    photo_url: null,
    joined_at: new Date("2026-01-01T00:00:00.000Z"),
    organization_id: ORGANIZATION_ID,
    type: "owner",
    first_owner_flag: true,
    permission_id: "perm-1",
    version: 1,
  };
}

function permission() {
  return {
    id: "perm-1",
    user_id: USER_ID,
    organization_id: ORGANIZATION_ID,
    rh: 3,
    ti: 2,
  };
}

function forwardedHeaders(overrides: Record<string, string> = {}): HeadersInit {
  return {
    "x-internal-service-token": INTERNAL_TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-type": "owner",
    "x-auth-modules": JSON.stringify({ rh: 3 }),
    ...overrides,
  };
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function sign(payload: Record<string, unknown>): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
}

describe("user Worker", () => {
  it("returns health and readiness envelopes", async () => {
    const app = createUserWorkerApp({ env: env(), prisma: prisma() });

    expect(await (await app.request("https://user.test/health")).json()).toEqual({
      success: true,
      data: { status: "ok", service: "user-service" },
    });
    expect(await (await app.request("https://user.test/ready")).json()).toEqual({
      success: true,
      data: { status: "ready", service: "user-service" },
    });
  });

  it("rejects protected user routes without authentication", async () => {
    const app = createUserWorkerApp({ env: env(), prisma: prisma() });

    const response = await app.request("https://user.test/user");

    expect(response.status).toBe(401);
  });

  it("uses forwarded gateway identity and organization isolation for user lists", async () => {
    const db = prisma();
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/user?skip=2&take=10", {
      headers: forwardedHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        users: [expect.objectContaining({ id: USER_ID, organization_id: ORGANIZATION_ID })],
        total: 1,
        skip: 2,
        take: 10,
      },
    });
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORGANIZATION_ID }, skip: 2, take: 10 }),
    );
  });

  it("accepts a signed cookie session for /user/me", async () => {
    const db = prisma();
    const csrfToken = "A".repeat(43);
    const sessionToken = await sign({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      auth_kind: "organization",
      type: "owner",
      session_version: 1,
      session_id: "session-1",
      csrf_hash: await hashCsrfToken(csrfToken),
      modules: { rh: 3 },
    });
    db.authSession.findFirst.mockResolvedValue({
      csrf_hash: await hashCsrfToken(csrfToken),
      user: { session_version: 1, organization_id: ORGANIZATION_ID, status: "active" },
    });
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/user/me", {
      headers: { cookie: `cw.session=${sessionToken}; cw.csrf=${csrfToken}` },
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      id: USER_ID,
      organization_id: ORGANIZATION_ID,
    });
  });

  it("requires CSRF for cookie permission mutations and protects platform tenant reads", async () => {
    const db = prisma();
    const csrfToken = "B".repeat(43);
    const platformToken = await sign({
      user_id: PLATFORM_USER_ID,
      auth_kind: "platform",
      platform_role: "super_admin",
      session_version: 1,
      session_id: "platform-session-1",
      csrf_hash: await hashCsrfToken(csrfToken),
    });
    db.platformAuthSession.findFirst.mockResolvedValue({
      csrf_hash: await hashCsrfToken(csrfToken),
      platformUser: {
        id: PLATFORM_USER_ID,
        name: "Platform",
        email: "platform@example.com",
        platform_role: "super_admin",
        status: "active",
        session_version: 1,
      },
    });
    const organizationToken = await sign({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      auth_kind: "organization",
      type: "owner",
      session_version: 1,
      session_id: "session-1",
      csrf_hash: await hashCsrfToken(csrfToken),
    });
    db.authSession.findFirst.mockResolvedValue({
      csrf_hash: await hashCsrfToken(csrfToken),
      user: { session_version: 1, organization_id: ORGANIZATION_ID, status: "active" },
    });
    const app = createUserWorkerApp({ env: env(), prisma: db });
    const cookie = `cw.session=${platformToken}; cw.csrf=${csrfToken}`;

    const denied = await app.request(
      `https://user.test/platform/organizations/${ORGANIZATION_ID}/departments`,
      { headers: { cookie } },
    );
    expect(denied.status).toBe(200);
    expect((await denied.json()).data).toEqual([{ id: "dep-1", name: "Tecnologia" }]);

    const mutation = await app.request(`https://user.test/user/permission/${USER_ID}`, {
      method: "PUT",
      headers: {
        cookie: `cw.session=${organizationToken}; cw.csrf=${csrfToken}`,
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ rh: 2 }),
    });
    expect(mutation.status).toBe(200);
    expect(db.permission.updateMany).toHaveBeenCalled();
  });

  it("returns validation errors before touching Prisma", async () => {
    const db = prisma();
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/user/permission/user-1?modulo=retired", {
      headers: forwardedHeaders(),
    });

    expect(response.status).toBe(400);
    expect(db.permission.findFirst).not.toHaveBeenCalled();
  });
});
