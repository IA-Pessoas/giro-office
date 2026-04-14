import "./envBootstrap.js";

import { Writable } from "node:stream";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDepartmentApp } from "../app.js";
import { getDepartmentServiceEnv } from "../config/env.js";
import type { DepartmentRouteDeps } from "../routes/department.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

function createDepartmentServiceMock(): DepartmentRouteDeps {
  return {
    create: vi.fn(async () => ({ dep: { id: "dep-1" } })),
    detail: vi.fn(async () => ({ dep: { id: "dep-1" } })),
    list: vi.fn(async () => []),
    update: vi.fn(async () => ({ id: "dep-1" })),
  };
}

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORGANIZATION_ID,
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

  it("GET /department sem dep_id retorna 400", async () => {
    const app = createTestApp(departmentServiceMock);

    const res = await request(app).get("/department").set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(departmentServiceMock.detail).not.toHaveBeenCalled();
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
});
