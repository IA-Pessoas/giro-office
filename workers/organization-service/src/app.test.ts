import { hashCsrfToken } from "@workspace/runtime";
import { describe, expect, it, vi } from "vitest";
import { createOrganizationWorkerApp } from "./app.js";
import { OrganizationWorkerError } from "./errors.js";
import type { OrganizationService } from "./organizationService.js";
import type { OrganizationPrismaClient } from "./types.js";

const env = {
  JWT_SECRET: "test-secret",
  INTERNAL_SERVICE_TOKEN: "internal-token",
  ORGANIZATION_DOMAIN_AUDIT_ENABLED: "false",
  NODE_ENV: "test",
  ENABLE_API_DOCS: "true",
} as const;

const organizationId = "11111111-1111-4111-8111-111111111111";

function fakeDependencies() {
  const service = {
    list: vi.fn().mockResolvedValue({ organizations: [], total: 0, page: 1, pageSize: 20 }),
    create: vi.fn().mockResolvedValue({ id: organizationId }),
    findById: vi.fn().mockResolvedValue({ id: organizationId }),
    updateStatus: vi.fn().mockResolvedValue({ id: organizationId, status: "active" }),
    updateSubscriptionPlan: vi
      .fn()
      .mockResolvedValue({ id: organizationId, subscription_plan: "pro" }),
    updateLogoUrl: vi.fn().mockResolvedValue({ id: organizationId, logo_url: null }),
    listPlatform: vi.fn().mockResolvedValue({ organizations: [], total: 0, page: 1, pageSize: 20 }),
    createPlatform: vi.fn().mockResolvedValue({ id: organizationId, status: "active" }),
    findPlatformById: vi.fn().mockResolvedValue({ id: organizationId }),
    updatePlatformStatus: vi.fn().mockResolvedValue({ id: organizationId, status: "active" }),
    updatePlatformSubscriptionPlan: vi
      .fn()
      .mockResolvedValue({ id: organizationId, subscription_plan: "pro" }),
    updatePlatformLogoUrl: vi.fn().mockResolvedValue({ id: organizationId, logo_url: null }),
  };
  const prisma = {
    organization: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    platformAuthSession: { findFirst: vi.fn() },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  return {
    service: service as unknown as OrganizationService,
    prisma: prisma as unknown as OrganizationPrismaClient,
    rawService: service,
    rawPrisma: prisma,
  };
}

function orgHeaders(organization = "org-1", type: "owner" | "admin" | "user" = "owner") {
  return {
    "x-auth-user-id": "user-1",
    "x-auth-kind": "organization",
    "x-auth-organization-id": organization,
    "x-auth-type": type,
    "x-internal-service-token": env.INTERNAL_SERVICE_TOKEN,
  };
}

function encode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function sign(claims: Record<string, unknown>): Promise<string> {
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${encode(new Uint8Array(signature))}`;
}

describe("organization-service Worker", () => {
  it("mantém o envelope de health e ready", async () => {
    const app = createOrganizationWorkerApp({ env });

    const health = await app.request("https://organization.test/health");
    const ready = await app.request("https://organization.test/ready");

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({
      success: true,
      data: { status: "ok", service: "organization-service" },
    });
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({
      success: true,
      data: { status: "ready", service: "organization-service" },
    });
  });

  it("retorna 401 para lista sem autenticação", async () => {
    const app = createOrganizationWorkerApp({ env });

    const response = await app.request("https://organization.test/organizations");

    expect(response.status).toBe(401);
    expect((await response.json()).success).toBe(false);
  });

  it("preserva as rotas organizacionais, envelope, query e escopo encaminhado", async () => {
    const dependencies = fakeDependencies();
    const app = createOrganizationWorkerApp({ env, ...dependencies });
    const headers = orgHeaders(organizationId);

    const list = await app.request(
      "https://organization.test/organizations?page=2&pageSize=10&status=active",
      { headers },
    );
    expect(list.status).toBe(200);
    expect(dependencies.rawService.list).toHaveBeenCalledWith(
      { page: 2, pageSize: 10, status: "active" },
      organizationId,
    );

    const created = await app.request("https://organization.test/organizations", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Castelo",
        email_created_by: "admin@example.com",
        cnpj: "11222333000181",
      }),
    });
    expect(created.status).toBe(201);
    expect((await created.json()).success).toBe(true);

    const detail = await app.request(`https://organization.test/organizations/${organizationId}`, {
      headers,
    });
    expect(detail.status).toBe(200);
    const status = await app.request(
      `https://organization.test/organizations/${organizationId}/status`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      },
    );
    const plan = await app.request(
      `https://organization.test/organizations/${organizationId}/subscription-plan`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ subscription_plan: "pro" }),
      },
    );
    const logo = await app.request(
      `https://organization.test/organizations/${organizationId}/logo-url`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ logo_url: null }),
      },
    );
    expect([status.status, plan.status, logo.status]).toEqual([200, 200, 200]);
    expect(dependencies.rawService.list).toHaveBeenCalledTimes(1);
  });

  it("não lê nem altera outra organização e reserva status e plano ao owner", async () => {
    const dependencies = fakeDependencies();
    const app = createOrganizationWorkerApp({ env, ...dependencies });
    const other = orgHeaders("22222222-2222-4222-8222-222222222222");
    const patch = (path: string, body: unknown, headers: Record<string, string>) =>
      app.request(`https://organization.test/organizations/${organizationId}/${path}`, {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    // Id de outra organização: 404, sem chegar ao serviço.
    const foreign = [
      (
        await app.request(`https://organization.test/organizations/${organizationId}`, {
          headers: other,
        })
      ).status,
      (await patch("status", { status: "suspended" }, other)).status,
      (await patch("subscription-plan", { subscription_plan: "pro" }, other)).status,
      (await patch("logo-url", { logo_url: null }, other)).status,
    ];
    expect(foreign).toEqual([404, 404, 404, 404]);
    expect(dependencies.rawService.findById).not.toHaveBeenCalled();
    expect(dependencies.rawService.updateStatus).not.toHaveBeenCalled();
    expect(dependencies.rawService.updateSubscriptionPlan).not.toHaveBeenCalled();
    expect(dependencies.rawService.updateLogoUrl).not.toHaveBeenCalled();

    // Na própria organização, admin troca o logo mas não suspende nem muda o plano.
    const admin = orgHeaders(organizationId, "admin");
    expect((await patch("status", { status: "suspended" }, admin)).status).toBe(403);
    expect((await patch("subscription-plan", { subscription_plan: "pro" }, admin)).status).toBe(
      403,
    );
    expect((await patch("logo-url", { logo_url: null }, admin)).status).toBe(200);
  });

  it("não aceita conflito de cabeçalho de organização e preserva erro de contrato", async () => {
    const dependencies = fakeDependencies();
    const app = createOrganizationWorkerApp({ env, ...dependencies });
    const mismatch = await app.request("https://organization.test/organizations", {
      headers: { ...orgHeaders("org-1"), organization_id: "org-2" },
    });
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json()).code).toBe("BAD_REQUEST");

    dependencies.rawService.findById.mockRejectedValue(
      new OrganizationWorkerError(409, "conflito"),
    );
    const conflict = await app.request(
      `https://organization.test/organizations/${organizationId}`,
      { headers: orgHeaders(organizationId) },
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      success: false,
      error: "conflito",
      code: "CONFLICT",
    });
  });

  it("protege a superfície de plataforma com sessão, DB session e CSRF", async () => {
    const dependencies = fakeDependencies();
    const csrf = "A".repeat(43);
    const sessionId = "platform-session-1";
    const csrfHash = await hashCsrfToken(csrf);
    const token = await sign({
      user_id: "platform-1",
      auth_kind: "platform",
      platform_role: "super_admin",
      session_id: sessionId,
      session_version: 1,
      csrf_hash: csrfHash,
    });
    dependencies.rawPrisma.platformAuthSession.findFirst.mockResolvedValue({
      csrf_hash: csrfHash,
      platformUser: {
        id: "platform-1",
        name: "Admin",
        email: "admin@example.com",
        platform_role: "super_admin",
        status: "active",
        session_version: 1,
      },
    });
    const app = createOrganizationWorkerApp({ env, ...dependencies });
    const platformHeaders = {
      cookie: `cw.session=${encodeURIComponent(token)}; cw.csrf=${csrf}`,
      "x-auth-user-id": "platform-1",
      "x-auth-kind": "platform",
      "x-auth-platform-role": "super_admin",
      "x-internal-service-token": env.INTERNAL_SERVICE_TOKEN,
    };
    const list = await app.request("https://organization.test/platform/organizations", {
      headers: platformHeaders,
    });
    expect(list.status).toBe(200);
    const create = await app.request("https://organization.test/platform/organizations", {
      method: "POST",
      headers: { ...platformHeaders, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({ name: "Castelo", cnpj: "11222333000181" }),
    });
    expect(create.status).toBe(201);
    expect(dependencies.rawService.createPlatform).toHaveBeenCalledWith({
      name: "Castelo",
      cnpj: "11222333000181",
      emailCreatedBy: "admin@example.com",
      actorPlatformUserId: "platform-1",
    });

    const noCsrf = await app.request("https://organization.test/platform/organizations", {
      method: "POST",
      headers: { ...platformHeaders, "content-type": "application/json" },
      body: JSON.stringify({ name: "Castelo", cnpj: "11222333000181" }),
    });
    expect(noCsrf.status).toBe(403);
  });

  it("publica o OpenAPI relevante sem abrir a superfície de dados", async () => {
    const app = createOrganizationWorkerApp({ env });
    const response = await app.request("https://organization.test/openapi.json");
    expect(response.status).toBe(200);
    const document = await response.json();
    expect(document.paths["/organizations"]).toBeDefined();
    expect(document.paths["/platform/organizations/{id}/logo-url"]).toBeDefined();
  });
});
