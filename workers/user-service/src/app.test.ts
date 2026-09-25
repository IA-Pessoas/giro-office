import { readFileSync } from "node:fs";
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
  const db = {
    user: {
      findFirst: vi.fn(async () => user()),
      findMany: vi.fn(async () => [user()]),
      count: vi.fn(async () => 1),
      create: vi.fn(async () => user()),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    permission: {
      findFirst: vi.fn(async () => permission()),
      create: vi.fn(async () => ({ id: "perm-created" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    permissionSpecific: { findFirst: vi.fn(async () => ({ task_completion: true })) },
    authSession: {
      findFirst: vi.fn(async () => ({
        csrf_hash: "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a",
        user: {
          session_version: 1,
          organization_id: ORGANIZATION_ID,
          status: "active",
          organization: { id: ORGANIZATION_ID, status: "active" },
          department: {
            organization_id: ORGANIZATION_ID,
            organization: { id: ORGANIZATION_ID, status: "active" },
          },
        },
      })),
      create: vi.fn(async () => ({ id: "session-created" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    passwordResetToken: {
      findFirst: vi.fn(async () => null as Record<string, unknown> | null),
      create: vi.fn(async () => ({ id: "reset-1" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
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
          can_impersonate: true,
        },
      })),
      create: vi.fn(async () => ({ id: "platform-session-created" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    platformUser: {
      findFirst: vi.fn(async () => platformUser() as Record<string, unknown> | null),
      findUnique: vi.fn(async () => platformUser() as Record<string, unknown> | null),
      findMany: vi.fn(async () => [] as Record<string, unknown>[]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    organization: { findFirst: vi.fn(async () => ({ id: ORGANIZATION_ID })) },
    department: {
      findFirst: vi.fn(async () => ({
        id: "dep-1",
        organization_id: ORGANIZATION_ID,
        name: "Tecnologia",
      })),
      findMany: vi.fn(async () => [{ id: "dep-1", name: "Tecnologia" }]),
    },
    $disconnect: vi.fn(async () => {}),
  };
  const transactionalDb = db as typeof db & { $transaction: ReturnType<typeof vi.fn> };
  transactionalDb.$transaction = vi.fn(async (callback: (transaction: unknown) => unknown) =>
    callback(transactionalDb),
  );
  return transactionalDb;
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
    session_version: 1,
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

function platformUser() {
  return {
    id: PLATFORM_USER_ID,
    name: "Platform",
    email: "platform@example.com",
    password: "stored-password-hash",
    platform_role: "super_admin",
    status: "active",
    session_version: 1,
    can_impersonate: true,
  };
}

function forwardedHeaders(overrides: Record<string, string> = {}): HeadersInit {
  return {
    "x-internal-service-token": INTERNAL_TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-type": "owner",
    "x-auth-modules": JSON.stringify({ rh: 3 }),
    "x-auth-session-id": "session-1",
    "x-auth-session-version": "1",
    "x-auth-csrf-hash": "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a",
    "x-csrf-token": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
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
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { organization_id: ORGANIZATION_ID },
            { organization_id: null, department: { organization_id: ORGANIZATION_ID } },
          ]),
        }),
        skip: 2,
        take: 10,
      }),
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
      user: {
        session_version: 1,
        organization_id: ORGANIZATION_ID,
        status: "active",
        organization: { id: ORGANIZATION_ID, status: "active" },
        department: {
          organization_id: ORGANIZATION_ID,
          organization: { id: ORGANIZATION_ID, status: "active" },
        },
      },
    });
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
    });

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
      user: {
        session_version: 1,
        organization_id: ORGANIZATION_ID,
        status: "active",
        organization: { id: ORGANIZATION_ID, status: "active" },
        department: {
          organization_id: ORGANIZATION_ID,
          organization: { id: ORGANIZATION_ID, status: "active" },
        },
      },
    });
    const app = createUserWorkerApp({ env: env(), prisma: db });
    const cookie = `cw.session=${platformToken}; cw.csrf=${csrfToken}`;

    const denied = await app.request(
      `https://user.test/platform/organizations/${ORGANIZATION_ID}/departments`,
      {
        headers: {
          cookie,
          ...forwardedHeaders({
            "x-auth-kind": "platform",
            "x-auth-platform-role": "super_admin",
            "x-auth-user-id": PLATFORM_USER_ID,
            "x-auth-organization-id": "",
          }),
        },
      },
    );
    expect(denied.status).toBe(200);

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

  it("refreshes an organization session and rotates its cookies", async () => {
    const db = prisma();
    const csrfToken = "C".repeat(43);
    const token = await sign({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      auth_kind: "organization",
      type: "owner",
      permission: 2,
      session_version: 1,
      session_id: "session-1",
      csrf_hash: await hashCsrfToken(csrfToken),
      modules: { rh: 3 },
    });
    db.authSession.findFirst.mockResolvedValue({
      csrf_hash: await hashCsrfToken(csrfToken),
      user: {
        session_version: 1,
        organization_id: ORGANIZATION_ID,
        status: "active",
        organization: { id: ORGANIZATION_ID, status: "active" },
        department: {
          organization_id: ORGANIZATION_ID,
          organization: { id: ORGANIZATION_ID, status: "active" },
        },
      },
    });
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/user/session/refresh", {
      method: "POST",
      headers: { cookie: `cw.session=${token}; cw.csrf=${csrfToken}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("cw.session=");
    expect((await response.json()).data.token).toBeUndefined();
    expect(db.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "session-1",
          user_id: USER_ID,
          csrf_hash: await hashCsrfToken(csrfToken),
        }),
      }),
    );
  });

  it("revokes an organization session and expires both cookies", async () => {
    const db = prisma();
    const csrfToken = "D".repeat(43);
    const token = await sign({
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
      user: {
        session_version: 1,
        organization_id: ORGANIZATION_ID,
        status: "active",
        organization: { id: ORGANIZATION_ID, status: "active" },
        department: {
          organization_id: ORGANIZATION_ID,
          organization: { id: ORGANIZATION_ID, status: "active" },
        },
      },
    });
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/user/session", {
      method: "DELETE",
      headers: { cookie: `cw.session=${token}; cw.csrf=${csrfToken}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await response.json()).data).toEqual({ loggedOut: true });
    expect(db.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-1", user_id: USER_ID, revoked_at: null },
      }),
    );
  });

  it("returns the reporting access context only with the internal token", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue({
      id: USER_ID,
      name: "Usuário",
      login: "usuario@example.com",
      type: "owner",
      department: {
        id: "dep-1",
        name: "Recursos Humanos",
        organization: { id: ORGANIZATION_ID, name: "Organização" },
      },
    });
    const app = createUserWorkerApp({
      env: { ...env(), REPORTS_INTERNAL_TOKEN: "reports-internal-token" },
      prisma: db,
    });

    const denied = await app.request("https://user.test/internal/reporting/access-context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: USER_ID, organizationId: ORGANIZATION_ID }),
    });
    expect(denied.status).toBe(403);

    const response = await app.request("https://user.test/internal/reporting/access-context", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": "reports-internal-token",
      },
      body: JSON.stringify({ userId: USER_ID, organizationId: ORGANIZATION_ID }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      user: { id: USER_ID },
      organization: { id: ORGANIZATION_ID },
      departmentModule: "rh",
    });
  });

  it("reads platform user details and permissions only inside the requested organization", async () => {
    const db = prisma();
    const app = createUserWorkerApp({ env: env(), prisma: db });
    const headers = forwardedHeaders({
      "x-auth-kind": "platform",
      "x-auth-platform-role": "super_admin",
      "x-auth-user-id": PLATFORM_USER_ID,
      "x-auth-organization-id": "",
      "x-auth-session-id": "platform-session-1",
      "x-auth-session-version": "1",
      "x-auth-csrf-hash": "b".repeat(64),
    });

    const detail = await app.request(
      `https://user.test/platform/organizations/${ORGANIZATION_ID}/users/${USER_ID}`,
      { headers },
    );
    const permissions = await app.request(
      `https://user.test/platform/organizations/${ORGANIZATION_ID}/users/${USER_ID}/permissions`,
      { headers },
    );

    expect(detail.status).toBe(200);
    expect((await detail.json()).data).toMatchObject({ id: USER_ID });
    expect(permissions.status).toBe(200);
    expect((await permissions.json()).data).toMatchObject({ rh: 3 });
    expect(db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: USER_ID,
          OR: expect.arrayContaining([
            { organization_id: ORGANIZATION_ID },
            { organization_id: null, department: { organization_id: ORGANIZATION_ID } },
          ]),
        }),
      }),
    );
  });

  it("updates a user in the authenticated organization with optimistic versioning", async () => {
    const db = prisma();
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request(`https://user.test/user/${USER_ID}`, {
      method: "PUT",
      headers: { ...forwardedHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ name: "Usuário atualizado", expected_version: 1 }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      id: USER_ID,
      name: "Usuário atualizado",
      version: 2,
    });
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: USER_ID,
          OR: expect.arrayContaining([
            { organization_id: ORGANIZATION_ID },
            { organization_id: null, department: { organization_id: ORGANIZATION_ID } },
          ]),
          version: 1,
        }),
      }),
    );
  });

  it("deactivates a user by revoking its active session version", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue({ ...user(), type: "admin" });
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request(`https://user.test/user/${USER_ID}`, {
      method: "DELETE",
      headers: forwardedHeaders(),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ message: "Usuário desativado com sucesso." });
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "inactive", session_version: { increment: 1 } }),
      }),
    );
  });

  it("creates an organization session with claims and browser cookies", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue({
      ...user(),
      password: "stored-password-hash",
      organization: { id: ORGANIZATION_ID, status: "active" },
      department: {
        organization_id: ORGANIZATION_ID,
        organization: { id: ORGANIZATION_ID, status: "active" },
      },
    });
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      verifyPassword: vi.fn(async () => true),
    } as never);

    const response = await app.request("https://user.test/user/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "usuario@example.com", password: "secret" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      id: USER_ID,
      organization_id: ORGANIZATION_ID,
      modules: expect.objectContaining({ rh: 3, ti: 2 }),
      service: "user-service",
    });
    expect(body.data.token).toBeUndefined();
    expect(body.data.csrfToken).toBeUndefined();
    expect(response.headers.get("set-cookie")).toContain("cw.session=");
    expect(db.authSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ user_id: USER_ID }) }),
    );
  });

  it("uses the Worker hash adapter for canonical organization login", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue({
      ...user(),
      password:
        "$argon2id$v=19$m=19456,p=1,t=2$dS0wPBAUPX/qYBGOMitPRw$6pkSNGexYumsTctHxTFdkGj/DzFIduoI+AqkAjvWO34",
      organization: { id: ORGANIZATION_ID, status: "active" },
      department: {
        organization_id: ORGANIZATION_ID,
        organization: { id: ORGANIZATION_ID, status: "active" },
      },
    });
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/user/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "usuario@example.com", password: "secret" }),
    });

    expect(response.status).toBe(200);
  });

  it("rehashes bcrypt legado depois de um login válido sem invalidar sessões existentes", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue({
      ...user(),
      password: "$2a$08$I6U8jb5KFT/FiqzpOrDcc.ofpgiWNATR.eS0WEruVrmYuyF.UwhUu",
      organization: { id: ORGANIZATION_ID, status: "active" },
      department: {
        organization_id: ORGANIZATION_ID,
        organization: { id: ORGANIZATION_ID, status: "active" },
      },
    });
    const hashPassword = vi.fn(async () => "rehash-argon2id");
    const app = createUserWorkerApp({ env: env(), prisma: db, hashPassword } as never);

    const response = await app.request("https://user.test/user/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "usuario@example.com", password: "secret" }),
    });

    expect(response.status).toBe(200);
    expect(hashPassword).toHaveBeenCalledWith("secret");
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: USER_ID }),
        data: { password: "rehash-argon2id" },
      }),
    );
  });

  /** Após o incremento, a releitura da sessão enxerga session_version 2, como no banco. */
  function mockPasswordChangedUser(db: ReturnType<typeof prisma>) {
    db.user.findFirst.mockImplementation((async (args: { select?: Record<string, unknown> }) => ({
      ...user(),
      password: "stored-password-hash",
      session_version: args?.select?.session_version ? 2 : 1,
    })) as never);
  }

  it("hashes password mutations instead of returning 501", async () => {
    const db = prisma();
    mockPasswordChangedUser(db);
    const hashPassword = vi.fn(async () => "new-argon2id-hash");
    const verifyPassword = vi.fn(async () => true);
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      hashPassword,
      verifyPassword,
    } as never);

    const response = await app.request(`https://user.test/user/${USER_ID}`, {
      method: "PUT",
      headers: { ...forwardedHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ password: "new-secret-123", current_password: "old-secret" }),
    });

    expect(response.status).toBe(200);
    expect(hashPassword).toHaveBeenCalledWith("new-secret-123");
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          password: "new-argon2id-hash",
          session_version: { increment: 1 },
        }),
      }),
    );
  });

  describe("troca da própria senha", () => {
    async function changeOwnPassword(body: Record<string, unknown>, valid = true) {
      const db = prisma();
      mockPasswordChangedUser(db);
      const verifyPassword = vi.fn(async () => valid);
      const hashPassword = vi.fn(async () => "new-argon2id-hash");
      const app = createUserWorkerApp({
        env: env(),
        prisma: db,
        hashPassword,
        verifyPassword,
      } as never);
      const response = await app.request(`https://user.test/user/${USER_ID}`, {
        method: "PUT",
        headers: { ...forwardedHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { response, db, verifyPassword };
    }

    it("recusa sem a senha atual", async () => {
      const { response, db } = await changeOwnPassword({ password: "nova-senha-forte" });

      expect(response.status).toBe(400);
      expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it("recusa com a senha atual incorreta", async () => {
      const { response, db, verifyPassword } = await changeOwnPassword(
        { password: "nova-senha-forte", current_password: "errada" },
        false,
      );

      expect(response.status).toBe(403);
      expect(verifyPassword).toHaveBeenCalledWith("errada", "stored-password-hash");
      expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it("recusa nova senha com menos de 10 caracteres", async () => {
      const { response, db } = await changeOwnPassword({
        password: "curta",
        current_password: "senha-atual",
      });

      expect(response.status).toBe(400);
      expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it("recusa nova senha igual à atual", async () => {
      const { response, db } = await changeOwnPassword({
        password: "senha-atual-123",
        current_password: "senha-atual-123",
      });

      expect(response.status).toBe(400);
      expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it("exige a senha atual também quando o nome muda junto", async () => {
      const { response, db } = await changeOwnPassword({
        name: "Novo nome",
        password: "nova-senha-forte",
      });

      expect(response.status).toBe(400);
      expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it("revoga as outras sessões e renova a sessão atual", async () => {
      const { response, db } = await changeOwnPassword({
        password: "nova-senha-forte",
        current_password: "senha-atual",
      });

      expect(response.status).toBe(200);
      expect(db.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ current_password: expect.anything() }),
        }),
      );
      expect(db.authSession.updateMany).toHaveBeenCalledWith({
        where: { user_id: USER_ID, id: { not: "session-1" }, revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });
      // Link de redefinição pendente (#1342) não sobrevive à troca feita pelo próprio usuário.
      expect(db.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { user_id: USER_ID, used_at: null },
        data: { used_at: expect.any(Date) },
      });
      const sessionToken = /cw\.session=([^;]+)/.exec(
        response.headers.get("set-cookie") ?? "",
      )?.[1];
      const claims = JSON.parse(
        Buffer.from(String(sessionToken).split(".")[1], "base64url").toString(),
      );
      expect(claims).toMatchObject({ session_id: "session-1", session_version: 2 });
    });
  });

  it("normaliza permissões e invalida a sessão ao fazer downgrade de type", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue({
      ...user(),
      type: "admin",
      first_owner_flag: false,
      permission: 2,
    });
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request(`https://user.test/user/${USER_ID}`, {
      method: "PUT",
      headers: { ...forwardedHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ type: "user", expected_version: 1 }),
    });

    expect(response.status).toBe(200);
    expect(db.permission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: USER_ID, organization_id: ORGANIZATION_ID },
        data: expect.objectContaining({ rh: 1, ti: 1, financeiro: 0, triagem: 0 }),
      }),
    );
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permission: 1,
          session_version: { increment: 1 },
        }),
      }),
    );
  });

  it("mantém os módulos enviados junto com type e permission, como o Node", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue({
      ...user(),
      type: "admin",
      first_owner_flag: false,
      permission: 1,
    });
    const app = createUserWorkerApp({ env: env(), prisma: db });

    // Payload do syncDepartmentPermission da tela de permissões.
    const response = await app.request(`https://user.test/user/${USER_ID}`, {
      method: "PUT",
      headers: { ...forwardedHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ permission: 2, type: "admin", modules: { fiscal: 2, ti: 1, rh: 1 } }),
    });

    expect(response.status).toBe(200);
    expect(db.permission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: USER_ID, organization_id: ORGANIZATION_ID },
        data: expect.objectContaining({ fiscal: 2, rh: 1, ti: 3 }),
      }),
    );
  });

  it("rejeita downgrade ou remoção do último owner ativo", async () => {
    const db = prisma();
    db.user.count.mockResolvedValue(1);
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request(`https://user.test/user/${USER_ID}`, {
      method: "PUT",
      headers: { ...forwardedHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ type: "admin", expected_version: 1 }),
    });

    expect(response.status).toBe(409);
    expect(db.user.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: "owner",
          status: "active",
        }),
      }),
    );
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("desativa owner dentro de transação serializável, incluindo a contagem", async () => {
    const db = prisma();
    const transactionCount = vi.fn(async () => 2);
    const transactionFindFirst = vi.fn(async () => user());
    const transactionUpdate = vi.fn(async () => ({ count: 1 }));
    const transaction = {
      ...db,
      user: {
        ...db.user,
        findFirst: transactionFindFirst,
        count: transactionCount,
        updateMany: transactionUpdate,
      },
    };
    db.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
      callback(transaction),
    );
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request(`https://user.test/user/${USER_ID}`, {
      method: "DELETE",
      headers: forwardedHeaders(),
    });

    expect(response.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(transactionCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "owner", status: "active" }),
      }),
    );
    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "inactive" }) }),
    );
    expect(db.user.count).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("does not create an organization session for a suspended organization", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue({
      ...user(),
      password: "stored-password-hash",
      organization: { id: ORGANIZATION_ID, status: "suspended" },
      department: {
        organization_id: ORGANIZATION_ID,
        organization: { id: ORGANIZATION_ID, status: "suspended" },
      },
    });
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      verifyPassword: vi.fn(async () => true),
    } as never);

    const response = await app.request("https://user.test/user/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "usuario@example.com", password: "secret" }),
    });

    expect(response.status).toBe(401);
    expect(db.authSession.create).not.toHaveBeenCalled();
  });

  it("creates a platform session only with the internal gateway token", async () => {
    const db = prisma();
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      verifyPassword: vi.fn(async () => true),
    } as never);

    const denied = await app.request("https://user.test/platform/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "platform@example.com", password: "secret" }),
    });
    expect(denied.status).toBe(403);

    const response = await app.request("https://user.test/platform/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": INTERNAL_TOKEN,
      },
      body: JSON.stringify({ email: "platform@example.com", password: "secret" }),
    });
    expect(response.status).toBe(200);
    // O app recusa a identidade de plataforma sem can_impersonate (isValidPlatformUser).
    expect((await response.json()).data).toEqual({
      id: PLATFORM_USER_ID,
      name: "Platform",
      email: "platform@example.com",
      auth_kind: "platform",
      platform_role: "super_admin",
      can_impersonate: true,
    });
    expect(db.platformAuthSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ platform_user_id: PLATFORM_USER_ID }),
      }),
    );
  });

  it("does not accept a valid platform cookie without gateway authorization", async () => {
    const db = prisma();
    const csrfToken = "G".repeat(43);
    const token = await sign({
      user_id: PLATFORM_USER_ID,
      auth_kind: "platform",
      platform_role: "super_admin",
      session_version: 1,
      session_id: "platform-session-1",
      csrf_hash: await hashCsrfToken(csrfToken),
    });
    db.platformAuthSession.findFirst.mockResolvedValue({
      csrf_hash: await hashCsrfToken(csrfToken),
      platformUser: platformUser(),
    });
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/platform/me", {
      headers: { cookie: `cw.session=${token}; cw.csrf=${csrfToken}` },
    });

    expect(response.status).toBe(401);
  });

  it("validates the platform browser session behind gateway forwarding on refresh", async () => {
    const db = prisma();
    const csrfToken = "H".repeat(43);
    const csrfHash = await hashCsrfToken(csrfToken);
    const token = await sign({
      user_id: PLATFORM_USER_ID,
      auth_kind: "platform",
      platform_role: "super_admin",
      session_version: 1,
      session_id: "platform-session-1",
      csrf_hash: csrfHash,
    });
    db.platformAuthSession.findFirst.mockResolvedValue({
      csrf_hash: csrfHash,
      platformUser: platformUser(),
    });
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/platform/session/refresh", {
      method: "POST",
      headers: {
        ...forwardedHeaders({
          "x-auth-kind": "platform",
          "x-auth-platform-role": "super_admin",
          "x-auth-user-id": PLATFORM_USER_ID,
          "x-auth-organization-id": "",
        }),
        cookie: `cw.session=${token}; cw.csrf=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ can_impersonate: true });
    expect(db.platformAuthSession.findFirst).toHaveBeenCalled();
    expect(db.platformAuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "platform-session-1",
          platform_user_id: PLATFORM_USER_ID,
          csrf_hash: csrfHash,
        }),
      }),
    );
  });

  it("rejects an organization cookie session when the organization is suspended", async () => {
    const db = prisma();
    const csrfToken = "I".repeat(43);
    const token = await sign({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      auth_kind: "organization",
      type: "owner",
      session_version: 1,
      session_id: "session-suspended-org",
      csrf_hash: await hashCsrfToken(csrfToken),
    });
    db.authSession.findFirst.mockResolvedValue({
      csrf_hash: await hashCsrfToken(csrfToken),
      user: {
        session_version: 1,
        organization_id: ORGANIZATION_ID,
        status: "active",
        organization: { id: ORGANIZATION_ID, status: "suspended" },
        department: {
          organization_id: ORGANIZATION_ID,
          organization: { id: ORGANIZATION_ID, status: "suspended" },
        },
      },
    });
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/user/me", {
      headers: { cookie: `cw.session=${token}; cw.csrf=${csrfToken}` },
    });

    expect(response.status).toBe(401);
  });

  it("reads a private user photo through a signed URL", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue({ ...user(), photo_url: `${USER_ID}/photo.png` });
    const storage = {
      getBucket: vi.fn(async () => ({ public: false })),
      upload: vi.fn(async () => {}),
      download: vi.fn(async () => new Response(null)),
      remove: vi.fn(async () => {}),
      createSignedUrl: vi.fn(async () => "https://storage.example/object/sign/Fotos/photo?token=1"),
    };
    const app = createUserWorkerApp({ env: env(), prisma: db, storage } as never);

    const response = await app.request(`https://user.test/user/${USER_ID}/photo`, {
      headers: forwardedHeaders(),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      url: "https://storage.example/object/sign/Fotos/photo?token=1",
    });
    expect(storage.getBucket).toHaveBeenCalledWith("Fotos");
    expect(storage.createSignedUrl).toHaveBeenCalledWith("Fotos", `${USER_ID}/photo.png`, 3600);
  });

  it("uploads and removes a user photo with the Fotos storage contract", async () => {
    const db = prisma();
    const storage = {
      getBucket: vi.fn(async () => ({ public: false })),
      upload: vi.fn(async () => {}),
      download: vi.fn(async () => new Response(null)),
      remove: vi.fn(async () => {}),
      createSignedUrl: vi.fn(async () => "https://storage.example/object/sign/Fotos/photo?token=1"),
    };
    const app = createUserWorkerApp({
      env: { ...env(), SUPABASE_URL: "https://storage.example" },
      prisma: db,
      storage,
    } as never);
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "avatar.png", {
        type: "image/png",
      }),
    );

    const uploaded = await app.request(`https://user.test/user/${USER_ID}/photo`, {
      method: "POST",
      headers: forwardedHeaders(),
      body: form,
    });

    expect(uploaded.status).toBe(200);
    expect(storage.upload).toHaveBeenCalledWith("Fotos", `${USER_ID}/photo.png`, expect.any(File), {
      contentType: "image/png",
      upsert: true,
    });
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          photo_url: `${USER_ID}/photo.png`,
        }),
      }),
    );
    expect((await uploaded.json()).data.photo_url).not.toContain("/public/");

    const removed = await app.request(`https://user.test/user/${USER_ID}/photo`, {
      method: "DELETE",
      headers: forwardedHeaders(),
    });

    expect(removed.status).toBe(200);
    expect(storage.remove).toHaveBeenCalledWith("Fotos", USER_ID);
  });

  it("exige CSRF criptográfico para upload e remoção de foto", async () => {
    const db = prisma();
    const storage = {
      getBucket: vi.fn(async () => ({ public: false })),
      upload: vi.fn(async () => {}),
      download: vi.fn(async () => new Response(null)),
      remove: vi.fn(async () => {}),
      createSignedUrl: vi.fn(async () => "https://storage.example/object/sign/Fotos/photo?token=1"),
    };
    const app = createUserWorkerApp({ env: env(), prisma: db, storage } as never);
    const makeForm = () => {
      const form = new FormData();
      form.set(
        "file",
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "avatar.png", {
          type: "image/png",
        }),
      );
      return form;
    };

    const missing = await app.request(`https://user.test/user/${USER_ID}/photo`, {
      method: "POST",
      headers: forwardedHeaders({ "x-csrf-token": "" }),
      body: makeForm(),
    });
    expect(missing.status).toBe(403);

    const incorrect = await app.request(`https://user.test/user/${USER_ID}/photo`, {
      method: "POST",
      headers: forwardedHeaders({ "x-csrf-token": "incorrect-token" }),
      body: makeForm(),
    });
    expect(incorrect.status).toBe(403);
    expect(storage.upload).not.toHaveBeenCalled();

    const uploaded = await app.request(`https://user.test/user/${USER_ID}/photo`, {
      method: "POST",
      headers: forwardedHeaders(),
      body: makeForm(),
    });
    expect(uploaded.status).toBe(200);

    const removedIncorrectly = await app.request(`https://user.test/user/${USER_ID}/photo`, {
      method: "DELETE",
      headers: forwardedHeaders({ "x-csrf-token": "incorrect-token" }),
    });
    expect(removedIncorrectly.status).toBe(403);
    expect(storage.remove).not.toHaveBeenCalled();

    const removed = await app.request(`https://user.test/user/${USER_ID}/photo`, {
      method: "DELETE",
      headers: forwardedHeaders(),
    });
    expect(removed.status).toBe(200);
    expect(storage.remove).toHaveBeenCalledWith("Fotos", USER_ID);
  });

  it("falha de forma explícita quando Fotos não é privado", async () => {
    const db = prisma();
    const storage = {
      getBucket: vi.fn(async () => ({ public: true })),
      upload: vi.fn(async () => {}),
      download: vi.fn(async () => new Response(null)),
      remove: vi.fn(async () => {}),
      createSignedUrl: vi.fn(async () => "https://storage.example/public/Fotos/photo.png"),
    };
    const app = createUserWorkerApp({ env: env(), prisma: db, storage } as never);
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "avatar.png", {
        type: "image/png",
      }),
    );

    const response = await app.request(`https://user.test/user/${USER_ID}/photo`, {
      method: "POST",
      headers: forwardedHeaders(),
      body: form,
    });

    expect(response.status).toBe(503);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects forwarded platform identity without a database-bound session", async () => {
    const db = prisma();
    db.platformAuthSession.findFirst.mockResolvedValue(null);
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/platform/me", {
      headers: forwardedHeaders({
        "x-auth-kind": "platform",
        "x-auth-platform-role": "super_admin",
        "x-auth-user-id": PLATFORM_USER_ID,
        "x-auth-organization-id": "",
        "x-auth-session-id": "platform-session-1",
        "x-auth-session-version": "1",
        "x-auth-csrf-hash": "b".repeat(64),
      }),
    });

    expect(response.status).toBe(401);
  });

  it("requires CSRF transport proof for forwarded platform mutations", async () => {
    const db = prisma();
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request(
      `https://user.test/platform/organizations/${ORGANIZATION_ID}/users/${USER_ID}`,
      {
        method: "DELETE",
        headers: forwardedHeaders({
          "x-auth-kind": "platform",
          "x-auth-platform-role": "super_admin",
          "x-auth-user-id": PLATFORM_USER_ID,
          "x-auth-organization-id": "",
          "x-auth-session-id": "platform-session-1",
          "x-auth-session-version": "1",
          "x-auth-csrf-hash": "b".repeat(64),
          "x-csrf-token": "",
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a user whose department and explicit organization disagree", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue({
      ...user(),
      password: "stored-password-hash",
      organization: { id: ORGANIZATION_ID, status: "active" },
      department: {
        organization_id: "other-organization",
        organization: { id: "other-organization", status: "active" },
      },
    });
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      verifyPassword: vi.fn(async () => true),
    });

    const response = await app.request("https://user.test/user/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "usuario@example.com", password: "secret" }),
    });

    expect(response.status).toBe(401);
    expect(db.authSession.create).not.toHaveBeenCalled();
  });

  it("creates an organization user with a tenant-bound department and permission", async () => {
    const db = prisma();
    const hashPassword = vi.fn(async () => "created-argon2id-hash");
    const audit = vi.fn(async () => {});
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      hashPassword,
      audit,
    } as never);

    const response = await app.request("https://user.test/user", {
      method: "POST",
      headers: { ...forwardedHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        name: "Novo usuário",
        login: "novo@example.com",
        password: "secret",
        department_id: "dep-1",
        permission: 1,
        type: "user",
      }),
    });

    expect(response.status).toBe(201);
    expect(hashPassword).toHaveBeenCalledWith("secret");
    expect(db.department.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dep-1", organization_id: ORGANIZATION_ID } }),
    );
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          department_id: "dep-1",
          organization_id: ORGANIZATION_ID,
          password: "created-argon2id-hash",
        }),
      }),
    );
    expect(db.permission.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { user_id: USER_ID, organization_id: ORGANIZATION_ID } }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", referring: "user" }),
    );
  });

  it("only writes user columns the Worker Prisma schema declares", async () => {
    // O Prisma mockado aceita qualquer campo; o real recusou `invited_by` em produção
    // ("Unknown argument"), porque o model User do Worker não tinha a coluna.
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const userModel = /^model User \{([\s\S]*?)^\}/mu.exec(schema)?.[1] ?? "";
    const columns = new Set([...userModel.matchAll(/^ {2}(\w+)\s/gmu)].map(([, field]) => field));
    const db = prisma();
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      hashPassword: vi.fn(async () => "created-argon2id-hash"),
    } as never);

    // Payload de buildAdminCreateUserPayload (CreateUserModal).
    const response = await app.request("https://user.test/user", {
      method: "POST",
      headers: { ...forwardedHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        name: "Novo admin",
        login: "novo.admin@example.com",
        password: "secret",
        department_id: "dep-1",
        permission: 1,
        organization_id: ORGANIZATION_ID,
        type: "admin",
        status: "active",
        modules: { ti: 3, rh: 1 },
        invited_by: "forged-inviter-id",
      }),
    });

    expect(response.status).toBe(201);
    const [[{ data }]] = db.user.create.mock.calls as unknown as [[{ data: object }]];
    expect(Object.keys(data).filter((key) => !columns.has(key))).toEqual([]);
    // invited_by vem da sessão, não do body (o front manda o próprio id, mas poderia forjar).
    expect(data).toMatchObject({ invited_by: USER_ID });
  });

  it("rejects organization user creation for a department in another tenant", async () => {
    const db = prisma();
    db.department.findFirst.mockResolvedValue(null);
    const app = createUserWorkerApp({ env: env(), prisma: db } as never);

    const response = await app.request("https://user.test/user", {
      method: "POST",
      headers: { ...forwardedHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        name: "Fora do tenant",
        login: "fora@example.com",
        password: "secret",
        department_id: "other-department",
        permission: 1,
        type: "user",
      }),
    });

    expect(response.status).toBe(403);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("rejects changing a user to a department in another tenant", async () => {
    const db = prisma();
    db.department.findFirst.mockResolvedValue(null);
    const app = createUserWorkerApp({ env: env(), prisma: db } as never);

    const response = await app.request(`https://user.test/user/${USER_ID}`, {
      method: "PUT",
      headers: { ...forwardedHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ department_id: "other-department" }),
    });

    expect(response.status).toBe(403);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("starts configuration with a legacy admin whose organization remains null", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue(null);
    const hashPassword = vi.fn(async () => "bootstrap-argon2id-hash");
    const app = createUserWorkerApp({
      env: { ...env(), ADMIN_PASSWORD: "admin-secret" },
      prisma: db,
      hashPassword,
    } as never);

    const response = await app.request("https://user.test/user/start-config", { method: "POST" });

    expect(response.status).toBe(200);
    expect(hashPassword).toHaveBeenCalledWith("admin-secret");
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          department_id: "dep-1",
          organization_id: null,
          password: "bootstrap-argon2id-hash",
          type: "owner",
        }),
      }),
    );
  });

  it("creates a platform-managed organization user instead of returning 501", async () => {
    const db = prisma();
    const csrfToken = "B".repeat(43);
    const csrfHash = await hashCsrfToken(csrfToken);
    db.platformAuthSession.findFirst.mockResolvedValue({
      csrf_hash: csrfHash,
      platformUser: platformUser(),
    });
    const hashPassword = vi.fn(async () => "platform-created-hash");
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      hashPassword,
    } as never);

    const response = await app.request(
      `https://user.test/platform/organizations/${ORGANIZATION_ID}/users`,
      {
        method: "POST",
        headers: {
          ...forwardedHeaders({
            "x-auth-kind": "platform",
            "x-auth-platform-role": "super_admin",
            "x-auth-user-id": PLATFORM_USER_ID,
            "x-auth-organization-id": "",
            "x-auth-session-id": "platform-session-1",
            "x-auth-session-version": "1",
            "x-auth-csrf-hash": csrfHash,
            "x-csrf-token": csrfToken,
          }),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Platform user",
          login: "platform-user@example.com",
          password: "secret",
          department_id: "dep-1",
          permission: 1,
          type: "user",
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(hashPassword).toHaveBeenCalledWith("secret");
  });

  it("normaliza todos os módulos do owner que perde ownership", async () => {
    const db = prisma();
    const csrfToken = "T".repeat(43);
    const csrfHash = await hashCsrfToken(csrfToken);
    const currentOwner = { ...user(), id: USER_ID, type: "owner", permission: 2, version: 1 };
    const successor = {
      ...user(),
      id: "d0000000-0000-4000-8000-000000000002",
      type: "admin",
      permission: 1,
      version: 1,
    };
    db.user.findFirst.mockResolvedValueOnce(currentOwner).mockResolvedValueOnce(successor);
    db.platformAuthSession.findFirst.mockResolvedValue({
      csrf_hash: csrfHash,
      platformUser: platformUser(),
    });
    db.user.count.mockResolvedValue(1);
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request(
      `https://user.test/platform/organizations/${ORGANIZATION_ID}/ownership-transfer`,
      {
        method: "POST",
        headers: {
          ...forwardedHeaders({
            "x-auth-kind": "platform",
            "x-auth-platform-role": "super_admin",
            "x-auth-user-id": PLATFORM_USER_ID,
            "x-auth-organization-id": "",
            "x-auth-session-id": "platform-session-1",
            "x-auth-session-version": "1",
            "x-auth-csrf-hash": csrfHash,
            "x-csrf-token": csrfToken,
          }),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          currentOwnerId: USER_ID,
          successorUserId: successor.id,
          previousOwnerAction: "demote",
          justification: "Rotação operacional",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(db.permission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: USER_ID, organization_id: ORGANIZATION_ID },
        data: expect.objectContaining({
          certificado: 0,
          financeiro: 0,
          triagem: 0,
          rh: 1,
          ti: 3,
        }),
      }),
    );
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: USER_ID }),
        data: expect.objectContaining({ session_version: { increment: 1 } }),
      }),
    );
  });

  it("mantém módulos e session_version na mesma transação quando a sessão falha", async () => {
    const db = prisma();
    const transactionPermissionUpdate = vi.fn(async () => ({ count: 1 }));
    const transactionUserUpdate = vi.fn(async () => {
      throw new Error("falha ao invalidar sessão");
    });
    const transaction = {
      ...db,
      permission: { ...db.permission, updateMany: transactionPermissionUpdate },
      user: { ...db.user, updateMany: transactionUserUpdate },
    };
    db.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
      callback(transaction),
    );
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request(`https://user.test/user/permission/${USER_ID}`, {
      method: "PUT",
      headers: { ...forwardedHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ financeiro: 3, triagem: 2 }),
    });

    expect(response.status).toBe(500);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(transactionPermissionUpdate).toHaveBeenCalled();
    expect(transactionUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { session_version: { increment: 1 } } }),
    );
    expect(db.permission.updateMany).not.toHaveBeenCalled();
  });
});

describe("admin de TI gerencia usuários com teto de permissão", () => {
  // Perfil do Vinicius: admin de Tecnologia, ti=3 e rh=1.
  const tiAdmin = () =>
    forwardedHeaders({
      "x-auth-type": "admin",
      "x-auth-modules": JSON.stringify({ ti: 3, rh: 1 }),
      "content-type": "application/json",
    });
  const nonOwnerTarget = () => ({
    ...user(),
    type: "user",
    first_owner_flag: false,
    permission: 1,
  });
  const newUser = (extra: Record<string, unknown> = {}) => ({
    name: "Novo",
    login: `novo-${Math.random()}@example.com`,
    password: "secret",
    department_id: "dep-1",
    permission: 1,
    type: "user",
    ...extra,
  });
  const request = (
    app: ReturnType<typeof createUserWorkerApp>,
    method: string,
    path: string,
    body?: unknown,
  ) =>
    app.request(`https://user.test${path}`, {
      method,
      headers: tiAdmin(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  it("lista e cria usuário dentro do próprio nível", async () => {
    const db = prisma();
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      hashPassword: async () => "h",
    } as never);

    expect((await request(app, "GET", "/user")).status).toBe(200);
    const created = await request(app, "POST", "/user", newUser({ modules: { ti: 2, rh: 1 } }));

    expect(created.status).toBe(201);
    expect(db.user.create).toHaveBeenCalled();
  });

  it("não concede módulo acima do próprio nível, nem via admin de outro departamento", async () => {
    const db = prisma();
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      hashPassword: async () => "h",
    } as never);

    const fiscal = await request(app, "POST", "/user", newUser({ modules: { fiscal: 2 } }));
    expect(fiscal.status).toBe(403);

    // Admin do Fiscal recebe fiscal=3 na normalização do servidor.
    db.department.findFirst.mockResolvedValue({
      id: "dep-1",
      organization_id: ORGANIZATION_ID,
      name: "Fiscal",
    });
    const fiscalAdmin = await request(app, "POST", "/user", newUser({ type: "admin" }));
    expect(fiscalAdmin.status).toBe(403);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("não cria owner nem altera, desativa ou reconfigura um owner", async () => {
    const db = prisma(); // user() é owner
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      hashPassword: async () => "h",
    } as never);

    expect((await request(app, "POST", "/user", newUser({ type: "owner" }))).status).toBe(403);
    expect((await request(app, "PUT", `/user/${USER_ID}`, { name: "Outro" })).status).toBe(403);
    expect((await request(app, "DELETE", `/user/${USER_ID}`)).status).toBe(403);
    expect((await request(app, "PUT", `/user/permission/${USER_ID}`, { ti: 1 })).status).toBe(403);
    expect(db.permission.updateMany).not.toHaveBeenCalled();
    // Foto: a checagem vem antes do storage (senão a do owner seria trocada antes do 403).
    expect((await request(app, "DELETE", `/user/${USER_ID}/photo`)).status).toBe(403);
  });

  it("salva permissões de não-owner até o próprio nível", async () => {
    const db = prisma();
    db.user.findFirst.mockResolvedValue(nonOwnerTarget());
    const app = createUserWorkerApp({
      env: env(),
      prisma: db,
      hashPassword: async () => "h",
    } as never);

    expect((await request(app, "PUT", `/user/permission/${USER_ID}`, { ti: 3 })).status).toBe(200);
    expect((await request(app, "PUT", `/user/permission/${USER_ID}`, { contabil: 2 })).status).toBe(
      403,
    );
  });

  it("quem tem TI abaixo de admin continua sem acesso", async () => {
    const app = createUserWorkerApp({ env: env(), prisma: prisma() });
    const response = await app.request("https://user.test/user", {
      headers: forwardedHeaders({
        "x-auth-type": "admin",
        "x-auth-modules": JSON.stringify({ ti: 2, rh: 1 }),
      }),
    });

    expect(response.status).toBe(403);
  });

  describe("redefinição de senha pelo administrador (#1342)", () => {
    const OTHER_USER_ID = "c0000000-0000-4000-8000-000000000002";
    const resetEnv = () => ({ ...env(), APP_PUBLIC_URL: "https://app.test" });

    function withTarget(db: ReturnType<typeof prisma>, overrides: Record<string, unknown> = {}) {
      db.user.findFirst.mockResolvedValue({
        ...user(),
        id: OTHER_USER_ID,
        name: "Alvo <b>",
        login: "alvo",
        email: "alvo@example.com",
        type: "user",
        first_owner_flag: false,
        permission: 1,
        ...overrides,
      } as never);
    }

    function resetRequest(app: ReturnType<typeof createUserWorkerApp>, headers: HeadersInit) {
      return app.request(`https://user.test/user/${OTHER_USER_ID}/password-reset`, {
        method: "POST",
        headers,
      });
    }

    function confirmRequest(app: ReturnType<typeof createUserWorkerApp>, password: string) {
      return app.request("https://user.test/user/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "t".repeat(43), password }),
      });
    }

    it("não deixa o administrador definir a senha de outro usuário", async () => {
      const db = prisma();
      withTarget(db);
      const app = createUserWorkerApp({ env: env(), prisma: db });

      const response = await app.request(`https://user.test/user/${OTHER_USER_ID}`, {
        method: "PUT",
        headers: { ...forwardedHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ password: "senha-escolhida-pelo-admin" }),
      });

      expect(response.status).toBe(403);
      expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it("não aceita senha no PATCH de usuário da plataforma", async () => {
      const db = prisma();
      const app = createUserWorkerApp({ env: env(), prisma: db });

      const response = await app.request(
        `https://user.test/platform/organizations/${ORGANIZATION_ID}/users/${OTHER_USER_ID}`,
        {
          method: "PATCH",
          headers: { ...(await platformHeaders(db)), "content-type": "application/json" },
          body: JSON.stringify({ password: "senha-escolhida-pelo-admin", expected_version: 1 }),
        },
      );

      expect(response.status).toBe(400);
      expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it("envia link de uso único e registra auditoria", async () => {
      const db = prisma();
      withTarget(db);
      const sendPasswordResetEmail = vi.fn(async () => {});
      const audit = vi.fn(async () => {});
      const app = createUserWorkerApp({
        env: resetEnv(),
        prisma: db,
        sendPasswordResetEmail,
        audit,
      } as never);

      const response = await resetRequest(app, forwardedHeaders());

      expect(response.status).toBe(200);
      expect(JSON.stringify(await response.json())).not.toMatch(/token/i);
      expect(db.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { user_id: OTHER_USER_ID, used_at: null },
        data: { used_at: expect.any(Date) },
      });
      const [{ data: created }] = db.passwordResetToken.create.mock.calls[0] as unknown as [
        { data: { user_id: string; token_hash: string; expires_at: Date } },
      ];
      expect(created.user_id).toBe(OTHER_USER_ID);
      expect(created.expires_at.getTime()).toBeGreaterThan(Date.now());
      expect(created.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000);
      const [message] = sendPasswordResetEmail.mock.calls[0] as unknown as [
        { to: string; name: string; link: string },
      ];
      expect(message.to).toBe("alvo@example.com");
      const link = new URL(message.link);
      expect(link.origin + link.pathname).toBe("https://app.test/redefinir-senha");
      expect(await hashCsrfToken(String(link.searchParams.get("token")))).toBe(created.token_hash);
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: USER_ID,
          action: "PASSWORD_RESET_REQUESTED",
          referring: "user",
          referringId: OTHER_USER_ID,
        }),
      );
    });

    it("usa o login como destino quando ele é um e-mail", async () => {
      const db = prisma();
      withTarget(db, { email: null, login: "alvo.login@example.com" });
      const sendPasswordResetEmail = vi.fn(async () => {});
      const app = createUserWorkerApp({
        env: resetEnv(),
        prisma: db,
        sendPasswordResetEmail,
      } as never);

      expect((await resetRequest(app, forwardedHeaders())).status).toBe(200);
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "alvo.login@example.com" }),
      );
    });

    it("recusa usuário sem e-mail", async () => {
      const db = prisma();
      withTarget(db, { email: null, login: "alvo" });
      const app = createUserWorkerApp({
        env: resetEnv(),
        prisma: db,
        sendPasswordResetEmail: vi.fn(async () => {}),
      } as never);

      expect((await resetRequest(app, forwardedHeaders())).status).toBe(422);
      expect(db.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it("responde 503 quando o envio de e-mail não está configurado", async () => {
      const db = prisma();
      withTarget(db);
      const app = createUserWorkerApp({ env: env(), prisma: db });

      expect((await resetRequest(app, forwardedHeaders())).status).toBe(503);
      expect(db.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it("exige gestão de usuários para pedir a redefinição", async () => {
      const db = prisma();
      withTarget(db);
      const app = createUserWorkerApp({
        env: resetEnv(),
        prisma: db,
        sendPasswordResetEmail: vi.fn(async () => {}),
      } as never);

      const response = await resetRequest(
        app,
        forwardedHeaders({ "x-auth-type": "user", "x-auth-modules": "{}" }),
      );

      expect(response.status).toBe(403);
      expect(db.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it("super admin envia a redefinição pela plataforma", async () => {
      const db = prisma();
      withTarget(db);
      const sendPasswordResetEmail = vi.fn(async () => {});
      const app = createUserWorkerApp({
        env: resetEnv(),
        prisma: db,
        sendPasswordResetEmail,
      } as never);

      const response = await app.request(
        `https://user.test/platform/organizations/${ORGANIZATION_ID}/users/${OTHER_USER_ID}/password-reset`,
        { method: "POST", headers: await platformHeaders(db) },
      );

      expect(response.status).toBe(200);
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "alvo@example.com" }),
      );
    });

    it("define a nova senha pelo link e derruba as sessões", async () => {
      const db = prisma();
      db.passwordResetToken.findFirst.mockResolvedValue({ id: "reset-1", user_id: OTHER_USER_ID });
      const hashPassword = vi.fn(async () => "reset-argon2id-hash");
      const audit = vi.fn(async () => {});
      const app = createUserWorkerApp({ env: env(), prisma: db, hashPassword, audit } as never);

      const response = await confirmRequest(app, "nova-senha-forte");

      expect(response.status).toBe(200);
      expect(db.passwordResetToken.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            token_hash: await hashCsrfToken("t".repeat(43)),
            used_at: null,
            expires_at: { gt: expect.any(Date) },
          },
        }),
      );
      expect(db.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { id: "reset-1", used_at: null },
        data: { used_at: expect.any(Date) },
      });
      expect(db.user.updateMany).toHaveBeenCalledWith({
        where: { id: OTHER_USER_ID },
        data: {
          password: "reset-argon2id-hash",
          session_version: { increment: 1 },
          version: { increment: 1 },
        },
      });
      expect(db.authSession.updateMany).toHaveBeenCalledWith({
        where: { user_id: OTHER_USER_ID, revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: OTHER_USER_ID, action: "PASSWORD_RESET_COMPLETED" }),
      );
    });

    it("recusa link inválido, expirado ou já usado", async () => {
      const db = prisma();
      const app = createUserWorkerApp({ env: env(), prisma: db });

      expect((await confirmRequest(app, "nova-senha-forte")).status).toBe(400);

      db.passwordResetToken.findFirst.mockResolvedValue({ id: "reset-1", user_id: OTHER_USER_ID });
      db.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      expect((await confirmRequest(app, "nova-senha-forte")).status).toBe(400);
      expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it("audita o pedido mesmo quando o e-mail falha", async () => {
      const db = prisma();
      withTarget(db);
      const audit = vi.fn(async () => {});
      const app = createUserWorkerApp({
        env: resetEnv(),
        prisma: db,
        audit,
        sendPasswordResetEmail: vi.fn(async () => {
          throw new Error("adapter fora do ar");
        }),
      } as never);
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      expect((await resetRequest(app, forwardedHeaders())).status).toBe(502);
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "PASSWORD_RESET_REQUESTED" }),
      );
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it("limita a um envio por minuto por usuário", async () => {
      const db = prisma();
      withTarget(db);
      db.passwordResetToken.findFirst.mockResolvedValue({ id: "reset-recente" });
      const app = createUserWorkerApp({
        env: resetEnv(),
        prisma: db,
        sendPasswordResetEmail: vi.fn(async () => {}),
      } as never);

      expect((await resetRequest(app, forwardedHeaders())).status).toBe(429);
      expect(db.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it("não redefine a senha de usuário desativado depois do envio", async () => {
      const db = prisma();
      db.passwordResetToken.findFirst.mockResolvedValue({ id: "reset-1", user_id: OTHER_USER_ID });
      db.user.findFirst.mockResolvedValue(null);
      const app = createUserWorkerApp({ env: env(), prisma: db });

      expect((await confirmRequest(app, "nova-senha-forte")).status).toBe(400);
      expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it("recusa nova senha curta no link", async () => {
      const db = prisma();
      db.passwordResetToken.findFirst.mockResolvedValue({ id: "reset-1", user_id: OTHER_USER_ID });
      const app = createUserWorkerApp({ env: env(), prisma: db });

      expect((await confirmRequest(app, "curta")).status).toBe(400);
      expect(db.user.updateMany).not.toHaveBeenCalled();
    });
  });
});

async function platformHeaders(
  db: ReturnType<typeof prisma>,
  userId = PLATFORM_USER_ID,
  operator: Record<string, unknown> = {},
): Promise<Record<string, string>> {
  const csrfToken = "C".repeat(43);
  const csrfHash = await hashCsrfToken(csrfToken);
  const token = await sign({
    user_id: userId,
    auth_kind: "platform",
    platform_role: "super_admin",
    session_version: 1,
    session_id: "platform-session-1",
    csrf_hash: csrfHash,
  });
  db.platformAuthSession.findFirst.mockResolvedValue({
    csrf_hash: csrfHash,
    platformUser: { ...platformUser(), id: userId, ...operator },
  });
  return {
    ...(forwardedHeaders({
      "x-auth-kind": "platform",
      "x-auth-platform-role": "super_admin",
      "x-auth-user-id": userId,
      "x-auth-organization-id": "",
    }) as Record<string, string>),
    cookie: `cw.session=${token}; cw.csrf=${csrfToken}`,
    "x-csrf-token": csrfToken,
  };
}

describe("super admins da plataforma (#1528)", () => {
  const TARGET_ID = "20000000-0000-4000-8000-000000000009";
  const target = (overrides: Record<string, unknown> = {}) => ({
    id: TARGET_ID,
    name: "Outra Admin",
    email: "outra@example.com",
    status: "active",
    can_impersonate: true,
    ...overrides,
  });

  it("lista super admins ordenados, sem senha", async () => {
    const db = prisma();
    db.platformUser.findMany.mockResolvedValue([target()]);
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/platform/super-admins", {
      headers: await platformHeaders(db),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([target()]);
    expect(db.platformUser.findMany).toHaveBeenCalledWith({
      where: { platform_role: "super_admin" },
      select: { id: true, name: true, email: true, status: true, can_impersonate: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  });

  it("a listagem exige sessão de plataforma", async () => {
    const db = prisma();
    const app = createUserWorkerApp({ env: env(), prisma: db });

    const response = await app.request("https://user.test/platform/super-admins", {
      headers: forwardedHeaders(),
    });

    expect(response.status).toBe(403);
    expect(db.platformUser.findMany).not.toHaveBeenCalled();
  });

  function patch(headers: Record<string, string>, body: unknown, id = TARGET_ID) {
    return {
      url: `https://user.test/platform/super-admins/${id}/impersonation-permission`,
      init: {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    };
  }

  it("revoga a permissão, derruba sessões do alvo e audita", async () => {
    const db = prisma();
    db.platformUser.findFirst.mockResolvedValue(target());
    const audit = vi.fn(async () => {});
    const app = createUserWorkerApp({ env: env(), prisma: db, audit } as never);
    const { url, init } = patch(await platformHeaders(db), { can_impersonate: false });

    const response = await app.request(url, init);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(target({ can_impersonate: false }));
    expect(db.platformUser.updateMany).toHaveBeenCalledWith({
      where: { id: TARGET_ID, platform_role: "super_admin", can_impersonate: true },
      data: { can_impersonate: false, session_version: { increment: 1 } },
    });
    expect(db.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        impersonator_platform_user_id: TARGET_ID,
        revoked_at: null,
        expires_at: { gt: expect.any(Date) },
      },
      data: { revoked_at: expect.any(Date) },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        platformActorUserId: PLATFORM_USER_ID,
        organizationId: null,
        action: "platform.super_admin.impersonation_permission.updated",
        referring: "platform_user",
        referringId: TARGET_ID,
        changes: expect.objectContaining({ can_impersonate: { from: true, to: false } }),
      }),
    );
  });

  it("concede sem mexer nas sessões", async () => {
    const db = prisma();
    db.platformUser.findFirst.mockResolvedValue(target({ can_impersonate: false }));
    const app = createUserWorkerApp({ env: env(), prisma: db });
    const { url, init } = patch(await platformHeaders(db), { can_impersonate: true });

    const response = await app.request(url, init);

    expect(response.status).toBe(200);
    expect(db.platformUser.updateMany).toHaveBeenCalledWith({
      where: { id: TARGET_ID, platform_role: "super_admin", can_impersonate: false },
      data: { can_impersonate: true },
    });
    expect(db.authSession.updateMany).not.toHaveBeenCalled();
  });

  it("recusa operador sem permissão de personificar", async () => {
    const db = prisma();
    const headers = await platformHeaders(db, PLATFORM_USER_ID, { can_impersonate: false });
    const app = createUserWorkerApp({ env: env(), prisma: db });
    const { url, init } = patch(headers, { can_impersonate: false });

    const response = await app.request(url, init);

    expect(response.status).toBe(403);
    expect(db.platformUser.updateMany).not.toHaveBeenCalled();
  });

  it("não deixa alterar a própria permissão", async () => {
    const db = prisma();
    const actorId = "30000000-0000-4000-8000-000000000001";
    const headers = await platformHeaders(db, actorId);
    const app = createUserWorkerApp({ env: env(), prisma: db });
    const { url, init } = patch(headers, { can_impersonate: false }, actorId);

    const response = await app.request(url, init);

    expect(response.status).toBe(409);
    expect(db.platformUser.updateMany).not.toHaveBeenCalled();
  });

  it("exige CSRF", async () => {
    const db = prisma();
    const { "x-csrf-token": _csrf, ...headers } = await platformHeaders(db);
    const app = createUserWorkerApp({ env: env(), prisma: db });
    const { url, init } = patch(headers, { can_impersonate: false });

    const response = await app.request(url, init);

    expect(response.status).toBe(403);
    expect(db.platformUser.updateMany).not.toHaveBeenCalled();
  });

  it("responde 404 quando o alvo não é super admin", async () => {
    const db = prisma();
    db.platformUser.findFirst.mockResolvedValue(null);
    const app = createUserWorkerApp({ env: env(), prisma: db });
    const { url, init } = patch(await platformHeaders(db), { can_impersonate: false });

    const response = await app.request(url, init);

    expect(response.status).toBe(404);
  });
});
