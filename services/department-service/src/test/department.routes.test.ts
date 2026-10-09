import "./envBootstrap.js";

import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDepartmentApp } from "../app.js";
import { getDepartmentServiceEnv } from "../config/env.js";
import { buildDepartmentServiceOpenApiSpec } from "../openapi/spec.js";
import type { DepartmentRouteDeps } from "../routes/department.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";

function createDepartmentServiceMock(): DepartmentRouteDeps {
  return {
    create: vi.fn(async () => ({ dep: { id: "dep-1" } })),
    detail: vi.fn(async () => ({ dep: { id: "dep-1" } })),
    list: vi.fn(async () => []),
    update: vi.fn(async () => ({ id: "dep-1" })),
  };
}

function gatewayHeaders(
  modules: Record<string, number> = { rh: 3 },
  type: "owner" | "admin" | "user" = "user",
): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORGANIZATION_ID,
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify(modules),
    [FORWARDED_AUTH_TYPE_HEADER]: type,
  };
}

function createTestLogger() {
  return createLogger({
    service: "department-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
}

function createTestApp(departmentService: DepartmentRouteDeps) {
  const env = getDepartmentServiceEnv();

  return createDepartmentApp({
    env,
    logger: createTestLogger(),
    departmentService,
  });
}

describe("department routes", () => {
  let departmentServiceMock: DepartmentRouteDeps;

  beforeEach(() => {
    departmentServiceMock = createDepartmentServiceMock();
  });

  it("GET /health returns success envelope", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.service).toBe("department-service");
    expect(res.body.data?.status).toBe("ok");
  });

  it("documenta os filtros administrativo e Marketing uma única vez no OpenAPI", () => {
    const spec = buildDepartmentServiceOpenApiSpec(getDepartmentServiceEnv());
    const route = spec.paths["/department/list"] as {
      get?: { parameters?: Array<{ name?: string }> };
    };

    expect(
      route.get?.parameters?.filter((parameter) => parameter.name === "administrative"),
    ).toHaveLength(1);
    expect(route.get?.parameters?.filter((parameter) => parameter.name === "marketing")).toHaveLength(1);
  });

  it("GET /department/list sem autenticacao retorna 401", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app).get("/department/list");

    expect(res.status).toBe(401);
    expect(departmentServiceMock.list).not.toHaveBeenCalled();
  });

  it("GET /department/list com auth do gateway chama list", async () => {
    departmentServiceMock.list = vi.fn(async () => [{ id: "dep-1" }]);
    const app = createTestApp(departmentServiceMock);

    const res = await request(app)
      .get("/department/list")
      .set(gatewayHeaders())
      .query({ status: "Ativo" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: "dep-1" }] });
    expect(departmentServiceMock.list).toHaveBeenCalledWith("Ativo", ORGANIZATION_ID);
  });

  it("GET /department/list no contexto Marketing exige nível 1 e mantém o escopo da organização", async () => {
    departmentServiceMock.list = vi.fn(async () => [{ id: "dep-1" }]);
    const app = createTestApp(departmentServiceMock);

    const res = await request(app)
      .get("/department/list")
      .set(gatewayHeaders({ marketing: 1 }))
      .query({ marketing: "true" });

    expect(res.status).toBe(200);
    expect(departmentServiceMock.list).toHaveBeenCalledWith(undefined, ORGANIZATION_ID);
  });

  it("GET /department/list no contexto Marketing recusa nível 0", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app)
      .get("/department/list")
      .set(gatewayHeaders({ marketing: 0 }))
      .query({ marketing: "true" });

    expect(res.status).toBe(403);
    expect(departmentServiceMock.list).not.toHaveBeenCalled();
  });

  it("GET /department/list recusa a combinação dos contextos administrativo e Marketing", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app)
      .get("/department/list")
      .set(gatewayHeaders({ marketing: 3, ti: 3 }))
      .query({ administrative: "true", marketing: "true" });

    expect(res.status).toBe(400);
    expect(departmentServiceMock.list).not.toHaveBeenCalled();
  });

  it("GET /department/list permite consultas operacionais autenticadas", async () => {
    departmentServiceMock.list = vi.fn(async () => [{ id: "dep-1" }]);
    const app = createTestApp(departmentServiceMock);

    const res = await request(app)
      .get("/department/list")
      .set(gatewayHeaders({ rh: 2, ti: 2 }));

    expect(res.status).toBe(200);
    expect(departmentServiceMock.list).toHaveBeenCalledWith(undefined, ORGANIZATION_ID);
  });

  it("GET /department/list para administracao exige permissao administrativa", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app)
      .get("/department/list")
      .set(gatewayHeaders({ rh: 2, ti: 2 }))
      .query({ administrative: "true" });

    expect(res.status).toBe(403);
    expect(departmentServiceMock.list).not.toHaveBeenCalled();
  });

  it("GET /department/list para administracao lista para owner", async () => {
    departmentServiceMock.list = vi.fn(async () => [{ id: "dep-1" }]);
    const app = createTestApp(departmentServiceMock);

    const res = await request(app)
      .get("/department/list")
      .set(gatewayHeaders({}, "owner"))
      .query({ administrative: "true" });

    expect(res.status).toBe(200);
    expect(departmentServiceMock.list).toHaveBeenCalledWith(undefined, ORGANIZATION_ID);
  });

  it("GET /department sem dep_id retorna 400", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app).get("/department").set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(departmentServiceMock.detail).not.toHaveBeenCalled();
  });

  it("GET /department exige permissao administrativa antes de consultar", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app)
      .get("/department")
      .set(gatewayHeaders({ rh: 2, ti: 1 }))
      .query({ dep_id: "dep-1" });

    expect(res.status).toBe(403);
    expect(departmentServiceMock.detail).not.toHaveBeenCalled();
  });

  it("GET /department permite owner sem nivel de modulo", async () => {
    departmentServiceMock.detail = vi.fn(async () => ({ dep: { id: "dep-1" } }));
    const app = createTestApp(departmentServiceMock);

    const res = await request(app)
      .get("/department")
      .set(gatewayHeaders({}, "owner"))
      .query({ dep_id: "dep-1" });

    expect(res.status).toBe(200);
    expect(departmentServiceMock.detail).toHaveBeenCalledWith("dep-1", ORGANIZATION_ID);
  });

  it("POST /department invalido retorna 400", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app).post("/department").set(gatewayHeaders()).send({});

    expect(res.status).toBe(400);
    expect(departmentServiceMock.create).not.toHaveBeenCalled();
  });

  it("POST /department valido retorna 201", async () => {
    departmentServiceMock.create = vi.fn(async () => ({ dep: { id: "dep-1" } }));
    const app = createTestApp(departmentServiceMock);

    const res = await request(app).post("/department").set(gatewayHeaders()).send({
      name: "Tecnologia",
      color: "#0F766E",
      solution: true,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: { dep: { id: "dep-1" } } });
    expect(departmentServiceMock.create).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      name: "Tecnologia",
      color: "#0F766E",
      solution: true,
    });
  });

  it("PUT /department sem campos mutaveis retorna 400", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app).put("/department").set(gatewayHeaders()).send({
      dep_id: "dep-1",
    });

    expect(res.status).toBe(400);
    expect(departmentServiceMock.update).not.toHaveBeenCalled();
  });

  it("PUT /department propaga 404 do service", async () => {
    departmentServiceMock.update = vi.fn(async () => {
      throw new ServiceError(404, "Departamento não existe.");
    });
    const app = createTestApp(departmentServiceMock);

    const res = await request(app).put("/department").set(gatewayHeaders()).send({
      dep_id: "dep-404",
      name: "Departamento Atualizado",
    });

    expect(res.status).toBe(404);
    expect(departmentServiceMock.update).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      dep_id: "dep-404",
      name: "Departamento Atualizado",
      color: undefined,
      status: undefined,
      solution: undefined,
    });
  });

  it("PUT /department recusa alteracao de cor sem permissao administrativa", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app)
      .put("/department")
      .set(gatewayHeaders({ rh: 2, ti: 2 }))
      .send({ dep_id: "dep-1", color: "#0F766E" });

    expect(res.status).toBe(403);
    expect(departmentServiceMock.update).not.toHaveBeenCalled();
  });

  it("PUT /department permite ao Marketing nível 3 alterar somente a cor", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app)
      .put("/department")
      .set(gatewayHeaders({ marketing: 3 }))
      .send({ dep_id: "dep-1", color: "#0F766E" });

    expect(res.status).toBe(200);
    expect(departmentServiceMock.update).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      dep_id: "dep-1",
      name: undefined,
      color: "#0F766E",
      status: undefined,
      solution: undefined,
    });
  });

  it("PUT /department recusa Marketing nível 2 e dados além da cor no nível 3", async () => {
    const app = createTestApp(departmentServiceMock);

    const editor = await request(app)
      .put("/department")
      .set(gatewayHeaders({ marketing: 2 }))
      .send({ dep_id: "dep-1", color: "#0F766E" });
    const extraFields = await request(app)
      .put("/department")
      .set(gatewayHeaders({ marketing: 3 }))
      .send({ dep_id: "dep-1", color: "#0F766E", name: "Outro nome" });

    expect(editor.status).toBe(403);
    expect(extraFields.status).toBe(403);
    expect(departmentServiceMock.update).not.toHaveBeenCalled();
  });
});
