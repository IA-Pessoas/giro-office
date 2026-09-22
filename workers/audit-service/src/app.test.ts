import { describe, expect, it, vi } from "vitest";

import { type AuditWorkerEnv, createAuditWorkerApp } from "./app.js";
import type { AuditRequestRepository } from "./repository.js";

const INTERNAL_TOKEN = "audit-internal-token";
const JWT_SECRET = "audit-worker-test-secret";

function env(overrides: Partial<AuditWorkerEnv> = {}): AuditWorkerEnv {
  return {
    AUDIT_ENABLED: "true",
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    JWT_SECRET,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
    ...overrides,
  };
}

function repository(): AuditRequestRepository {
  return {
    create: vi.fn(async () => undefined),
    search: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 50 })),
    searchPlatform: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 50 })),
    findByRequestId: vi.fn(async () => null),
  };
}

function internalHeaders(overrides: Record<string, string> = {}): HeadersInit {
  return { "x-internal-service-token": INTERNAL_TOKEN, ...overrides };
}

function organizationHeaders(overrides: Record<string, string> = {}): HeadersInit {
  return internalHeaders({
    "x-auth-user-id": "user-1",
    "x-auth-organization-id": "org-1",
    "x-auth-kind": "organization",
    "x-auth-permission": "2",
    ...overrides,
  });
}

function platformHeaders(overrides: Record<string, string> = {}): HeadersInit {
  return internalHeaders({
    "x-auth-user-id": "platform-user-1",
    "x-auth-kind": "platform",
    "x-auth-platform-role": "super_admin",
    ...overrides,
  });
}

describe("audit worker", () => {
  it("returns the standard health and readiness envelopes", async () => {
    const app = createAuditWorkerApp({ env: env(), repository: repository() });

    const health = await app.request("http://audit.test/health");
    const ready = await app.request("http://audit.test/ready");

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      success: true,
      data: { status: "ok", service: "audit-service" },
    });
    expect(ready.status).toBe(200);
  });

  it("rejects audit reads without the internal token and forwarded identity", async () => {
    const app = createAuditWorkerApp({ env: env(), repository: repository() });

    const response = await app.request("http://audit.test/audit/requests");

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Não autenticado.");
  });

  it("creates an audit request through the internal write route", async () => {
    const repo = repository();
    const app = createAuditWorkerApp({ env: env(), repository: repo });
    const payload = {
      requestId: "request-1",
      organizationId: "org-1",
      method: "GET",
      path: "/users",
      outcome: "success",
      serviceSource: "gateway",
      createdAt: "2026-09-22T00:00:00.000Z",
    };

    const response = await app.request("http://audit.test/internal/audit/requests", {
      method: "POST",
      headers: { ...internalHeaders(), "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, data: { requestId: "request-1" } });
    expect(repo.create).toHaveBeenCalledWith(payload);
  });

  it("scopes organization search and detail to the forwarded organization", async () => {
    const repo = repository();
    const record = {
      id: "audit-1",
      requestId: "request-1",
      organizationId: "org-1",
      method: "GET",
      path: "/users",
      outcome: "success" as const,
      serviceSource: "gateway",
      createdAt: "2026-09-22T00:00:00.000Z",
    };
    vi.mocked(repo.search).mockResolvedValue({ items: [record], total: 1, page: 1, pageSize: 50 });
    vi.mocked(repo.findByRequestId).mockResolvedValue(record);
    const app = createAuditWorkerApp({ env: env(), repository: repo });

    const search = await app.request("http://audit.test/audit/requests?organizationId=forged", {
      headers: organizationHeaders(),
    });
    const detail = await app.request("http://audit.test/audit/requests/request-1", {
      headers: organizationHeaders({ "x-auth-organization-id": "org-1" }),
    });

    expect(search.status).toBe(200);
    expect(vi.mocked(repo.search)).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
    );
    expect(detail.status).toBe(200);
    expect(vi.mocked(repo.findByRequestId)).toHaveBeenCalledWith("request-1", "org-1");
  });

  it("supports the platform search surface only for super admins", async () => {
    const repo = repository();
    const app = createAuditWorkerApp({ env: env(), repository: repo });

    const response = await app.request("http://audit.test/audit/requests?page=1&pageSize=25", {
      headers: platformHeaders(),
    });

    expect(response.status).toBe(200);
    expect(repo.searchPlatform).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 25 }),
    );
  });

  it("returns validation errors without writing malformed audit payloads", async () => {
    const repo = repository();
    const app = createAuditWorkerApp({ env: env(), repository: repo });

    const response = await app.request("http://audit.test/internal/audit/requests", {
      method: "POST",
      headers: { ...internalHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ requestId: "missing-required-fields" }),
    });

    expect(response.status).toBe(400);
    expect(repo.create).not.toHaveBeenCalled();
  });
});
