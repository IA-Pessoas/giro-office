import { ServiceError } from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createDepartmentWorkerApp, type DepartmentWorkerEnv } from "./app.js";

const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const JWT_SECRET = "department-worker-test-secret-which-is-long-enough";
const INTERNAL_TOKEN = "department-gateway-internal-token";

type Department = {
  id: string;
  name: string;
  color: string | null;
  status: string;
  solution: boolean | null;
};

type DepartmentServiceMock = {
  list: ReturnType<typeof vi.fn>;
  detail: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function createDepartmentServiceMock(): DepartmentServiceMock {
  return {
    list: vi.fn(async () => []),
    detail: vi.fn(async () => ({ dep: department() })),
    create: vi.fn(async () => ({ dep: department() })),
    update: vi.fn(async () => department()),
  };
}

function department(): Department {
  return {
    id: "dep-1",
    name: "Tecnologia",
    color: "#0F766E",
    status: "Ativo",
    solution: true,
  };
}

function env(): DepartmentWorkerEnv {
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
    "x-auth-kind": "organization",
    "x-auth-type": "owner",
    "x-auth-modules": JSON.stringify({ ti: 2 }),
    ...overrides,
  };
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function signToken(payload: Record<string, unknown>): Promise<string> {
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

describe("department Worker", () => {
  it("GET /health returns the success envelope", async () => {
    const app = createDepartmentWorkerApp({
      env: env(),
      departmentService: createDepartmentServiceMock(),
    });

    const response = await app.request("http://department.test/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { status: "ok", service: "department-service" },
    });
  });

  it("GET /ready returns the success envelope", async () => {
    const app = createDepartmentWorkerApp({
      env: env(),
      departmentService: createDepartmentServiceMock(),
    });

    const response = await app.request("http://department.test/ready");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { status: "ready", service: "department-service" },
    });
  });

  it("accepts gateway forwarded identity and preserves it in the domain call", async () => {
    const service = createDepartmentServiceMock();
    service.list.mockResolvedValue([department()]);
    const app = createDepartmentWorkerApp({ env: env(), departmentService: service });

    const response = await app.request("http://department.test/department/list?status=Ativo", {
      headers: gatewayHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: [department()] });
    expect(service.list).toHaveBeenCalledWith("Ativo", ORGANIZATION_ID);
  });

  it("accepts an organization Bearer token", async () => {
    const service = createDepartmentServiceMock();
    const token = await signToken({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      auth_kind: "organization",
      modules: { ti: 1 },
    });
    const app = createDepartmentWorkerApp({ env: env(), departmentService: service });

    const response = await app.request("http://department.test/department?dep_id=dep-1", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(service.detail).toHaveBeenCalledWith("dep-1", ORGANIZATION_ID);
  });

  it("accepts an organization session cookie", async () => {
    const service = createDepartmentServiceMock();
    const token = await signToken({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      auth_kind: "organization",
      modules: { ti: 1 },
    });
    const app = createDepartmentWorkerApp({ env: env(), departmentService: service });

    const response = await app.request("http://department.test/department/list", {
      headers: { cookie: `cw.session=${token}` },
    });

    expect(response.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(undefined, ORGANIZATION_ID);
  });

  it("returns 401 without authentication", async () => {
    const service = createDepartmentServiceMock();
    const app = createDepartmentWorkerApp({ env: env(), departmentService: service });

    const response = await app.request("http://department.test/department/list");

    expect(response.status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("returns 403 when the authenticated user lacks ti permission", async () => {
    const service = createDepartmentServiceMock();
    const token = await signToken({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      auth_kind: "organization",
      modules: { ti: 0 },
    });
    const app = createDepartmentWorkerApp({ env: env(), departmentService: service });

    const response = await app.request("http://department.test/department/list", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid query and body", async () => {
    const service = createDepartmentServiceMock();
    const app = createDepartmentWorkerApp({ env: env(), departmentService: service });

    const invalidQuery = await app.request("http://department.test/department/list?status=wrong", {
      headers: gatewayHeaders(),
    });
    const invalidBody = await app.request("http://department.test/department", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(invalidQuery.status).toBe(400);
    expect(invalidBody.status).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
  });

  it("runs CRUD with the current envelopes and identity", async () => {
    const service = createDepartmentServiceMock();
    const app = createDepartmentWorkerApp({ env: env(), departmentService: service });

    const createResponse = await app.request("http://department.test/department", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ name: "Tecnologia", color: "#0F766E", solution: true }),
    });
    const detailResponse = await app.request("http://department.test/department?dep_id=dep-1", {
      headers: gatewayHeaders(),
    });
    const updateResponse = await app.request("http://department.test/department", {
      method: "PUT",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ dep_id: "dep-1", name: "Produto" }),
    });

    expect(createResponse.status).toBe(201);
    expect(detailResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(service.create).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      name: "Tecnologia",
      color: "#0F766E",
      solution: true,
    });
    expect(service.update).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      dep_id: "dep-1",
      name: "Produto",
      color: undefined,
      status: undefined,
      solution: undefined,
    });
  });

  it.each([
    [404, "Departamento não encontrado."],
    [409, "Departamento já cadastrado."],
  ])("propagates domain error %s", async (statusCode, message) => {
    const service = createDepartmentServiceMock();
    service.detail.mockRejectedValue(new ServiceError(statusCode, message));
    const app = createDepartmentWorkerApp({ env: env(), departmentService: service });

    const response = await app.request("http://department.test/department?dep_id=dep-1", {
      headers: gatewayHeaders(),
    });

    expect(response.status).toBe(statusCode);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, error: message });
  });
});
