import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  createLogger,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createProjectApplication } from "../app.js";
import { getProjectServiceEnv } from "../config/env.js";
import type { ProjectCrudRouteDeps } from "../routes/projectCrud.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "audit-service-token";
const env = getProjectServiceEnv();
const logger = createLogger({
  service: "project-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
  };
}

describe("projectcrud routes", () => {
  it("POST /project sem token interno retorna 401", async () => {
    const deps: ProjectCrudRouteDeps = {
      create: vi.fn(async () => ({ create: {} })),
      list: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
      detail: vi.fn(async () => ({ detail: {} })),
      delete: vi.fn(async () => ({ response: {} })),
    };
    const app = createProjectApplication({ env, logger, projectCrudService: deps });

    const res = await request(app)
      .post("/project")
      .set("Content-Type", "application/json")
      .send({});

    expect(res.status).toBe(401);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("POST /project com auth gateway chama create e retorna 201", async () => {
    const payload = {
      create: {
        id: "d0000000-0000-4000-8000-000000000001",
        name: "Novo",
      },
    };
    const deps: ProjectCrudRouteDeps = {
      create: vi.fn(async () => payload),
      list: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
      detail: vi.fn(async () => ({ detail: {} })),
      delete: vi.fn(async () => ({ response: {} })),
    };
    const app = createProjectApplication({ env, logger, projectCrudService: deps });

    const body = {
      name: "Novo",
      client_id: "b0000000-0000-4000-8000-000000000001",
      start_date: "2025-02-01",
      objective: "obj",
    };

    const res = await request(app)
      .post("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: payload });
    expect(deps.create).toHaveBeenCalledTimes(1);
  });

  it("GET /integracao-projects sem ref válido retorna 400", async () => {
    const deps: ProjectCrudRouteDeps = {
      create: vi.fn(async () => ({ create: {} })),
      list: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
      detail: vi.fn(async () => ({ detail: {} })),
      delete: vi.fn(async () => ({ response: {} })),
    };
    const app = createProjectApplication({ env, logger, projectCrudService: deps });

    const res = await request(app)
      .get("/project/list")
      .query({ ref: "invalido", id: "b0000000-0000-4000-8000-000000000001" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.list).not.toHaveBeenCalled();
  });
});
