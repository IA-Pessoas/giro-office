import { ServiceError } from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createFiscalWorkerApp, type FiscalWorkerEnv } from "./app.js";

const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const ICMS_ID = "e0000000-0000-4000-8000-000000000001";
const JWT_SECRET = "fiscal-worker-test-secret-which-is-long-enough";
const INTERNAL_TOKEN = "fiscal-gateway-internal-token";

type Icms = { id: string; state: string; description: string; organization_id: string };

type IcmsServiceMock = {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  detail: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

function icms(): Icms {
  return { id: ICMS_ID, state: "SP", description: "ICMS", organization_id: ORGANIZATION_ID };
}

function service(): IcmsServiceMock {
  return {
    create: vi.fn(async () => ({ create: icms() })),
    update: vi.fn(async () => icms()),
    delete: vi.fn(async () => ({ deleted: icms() })),
    detail: vi.fn(async () => ({ detail: icms() })),
    list: vi.fn(async () => ({ data: [icms()], total: 1, page: 1, limit: 50, hasMore: false })),
  };
}

function env(): FiscalWorkerEnv {
  return {
    JWT_SECRET,
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    AUDIT_SERVICE_TOKEN: "audit-token",
    AUDIT_SERVICE: { fetch: vi.fn(async () => new Response(null, { status: 201 })) },
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function gatewayHeaders(overrides: Record<string, string> = {}): HeadersInit {
  return {
    "x-internal-service-token": INTERNAL_TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-permission": "3",
    "x-auth-kind": "organization",
    "x-auth-type": "owner",
    "x-auth-modules": JSON.stringify({ fiscal: 3 }),
    ...overrides,
  };
}

describe("fiscal Worker", () => {
  it("returns success envelopes for health and ready", async () => {
    const app = createFiscalWorkerApp({ env: env(), icmsService: service() });

    const health = await app.request("https://fiscal.test/health");
    const ready = await app.request("https://fiscal.test/ready");

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      success: true,
      data: { status: "ok", service: "fiscal-service" },
    });
    expect(ready.status).toBe(200);
  });

  it("rejects fiscal routes without authentication", async () => {
    const fiscal = service();
    const app = createFiscalWorkerApp({ env: env(), icmsService: fiscal });

    const response = await app.request("https://fiscal.test/fiscal/icms/list");

    expect(response.status).toBe(401);
    expect(fiscal.list).not.toHaveBeenCalled();
  });

  it("passes the authenticated organization to reads and writes", async () => {
    const fiscal = service();
    const app = createFiscalWorkerApp({ env: env(), icmsService: fiscal });

    const list = await app.request("https://fiscal.test/fiscal/icms/list?page=2&page_size=10", {
      headers: gatewayHeaders(),
    });
    const create = await app.request("https://fiscal.test/fiscal/icms", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ state: "SP", description: "ICMS" }),
    });

    expect(list.status).toBe(200);
    expect(fiscal.list).toHaveBeenCalledWith(
      { icmsCodes: [], page: 2, page_size: 10 },
      ORGANIZATION_ID,
    );
    expect(create.status).toBe(201);
    expect(fiscal.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, organizationId: ORGANIZATION_ID, permission: 3 }),
    );
  });

  it("preserves validation and service errors", async () => {
    const fiscal = service();
    fiscal.detail.mockRejectedValue(new ServiceError(404, "ICMS não encontrado."));
    const app = createFiscalWorkerApp({ env: env(), icmsService: fiscal });

    const invalid = await app.request("https://fiscal.test/fiscal/icms", {
      headers: gatewayHeaders(),
    });
    const missing = await app.request(`https://fiscal.test/fiscal/icms?icms_id=${ICMS_ID}`, {
      headers: gatewayHeaders(),
    });

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      success: false,
      error: "ICMS não encontrado.",
      code: "NOT_FOUND",
      requestId: missing.headers.get("x-request-id"),
    });
  });

  it("runs the representative ICMS read/write paths", async () => {
    const fiscal = service();
    const app = createFiscalWorkerApp({ env: env(), icmsService: fiscal });
    const headers = gatewayHeaders();
    const jsonHeaders = { ...headers, "content-type": "application/json" };

    const detail = await app.request(`https://fiscal.test/fiscal/icms?icms_id=${ICMS_ID}`, {
      headers,
    });
    const update = await app.request("https://fiscal.test/fiscal/icms", {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ icms_id: ICMS_ID, state: "SP", description: "Atualizado" }),
    });
    const remove = await app.request(`https://fiscal.test/fiscal/icms?icms_id=${ICMS_ID}`, {
      method: "DELETE",
      headers,
    });

    expect(detail.status).toBe(200);
    expect(update.status).toBe(200);
    expect(remove.status).toBe(200);
    expect(fiscal.detail).toHaveBeenCalledWith(ICMS_ID, ORGANIZATION_ID);
    expect(fiscal.update).toHaveBeenCalledWith(
      expect.objectContaining({ icms_id: ICMS_ID, organizationId: ORGANIZATION_ID }),
    );
    expect(fiscal.delete).toHaveBeenCalledWith(
      expect.objectContaining({ icms_id: ICMS_ID, organizationId: ORGANIZATION_ID }),
    );
  });
});
