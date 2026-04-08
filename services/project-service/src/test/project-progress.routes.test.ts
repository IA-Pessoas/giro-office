import "./env-bootstrap.js";

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
import type { ProjectProgressRouteDeps } from "../routes/project-progress.routes.js";
import type { ProjectCrudRouteDeps } from "../routes/projectcrud.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const PROJECT_ID = "d0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "audit-service-token";
const env = getProjectServiceEnv();
const logger = createLogger({
  service: "project-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const stubCrudDeps: ProjectCrudRouteDeps = {
  create: vi.fn(async () => ({ create: {} })),
  list: vi.fn(async () => []),
  update: vi.fn(async () => ({})),
  detail: vi.fn(async () => ({ detail: {} })),
  delete: vi.fn(async () => ({ response: {} })),
};

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
  };
}

describe("project-progress routes", () => {
  it("POST /integracao-project-progress sem token retorna 401", async () => {
    const progressDeps: ProjectProgressRouteDeps = {
      recalculateFromTasks: vi.fn(async () => ({
        project: {
          id: PROJECT_ID,
          status: "Em andamento",
          porcentage: 0,
          client_id: "b0000000-0000-4000-8000-000000000001",
        },
      })),
    };
    const app = createProjectApplication({
      env,
      logger,
      projectCrudService: stubCrudDeps,
      projectProgressService: progressDeps,
    });

    const res = await request(app)
      .post("/project/progress")
      .set("Content-Type", "application/json")
      .send({ project_id: PROJECT_ID });

    expect(res.status).toBe(401);
    expect(progressDeps.recalculateFromTasks).not.toHaveBeenCalled();
  });

  it("POST /integracao-project-progress com body inválido retorna 400", async () => {
    const progressDeps: ProjectProgressRouteDeps = {
      recalculateFromTasks: vi.fn(async () => ({
        project: {
          id: PROJECT_ID,
          status: "Em andamento",
          porcentage: 0,
          client_id: "b0000000-0000-4000-8000-000000000001",
        },
      })),
    };
    const app = createProjectApplication({
      env,
      logger,
      projectCrudService: stubCrudDeps,
      projectProgressService: progressDeps,
    });

    const res = await request(app)
      .post("/project/progress")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ project_id: "não-uuid" });

    expect(res.status).toBe(400);
    expect(progressDeps.recalculateFromTasks).not.toHaveBeenCalled();
  });

  it("POST /integracao-project-progress com auth gateway chama service e retorna 200", async () => {
    const payload = {
      project: {
        id: PROJECT_ID,
        status: "Em andamento",
        porcentage: 50,
        client_id: "b0000000-0000-4000-8000-000000000001",
      },
    };
    const progressDeps: ProjectProgressRouteDeps = {
      recalculateFromTasks: vi.fn(async () => payload),
    };
    const app = createProjectApplication({
      env,
      logger,
      projectCrudService: stubCrudDeps,
      projectProgressService: progressDeps,
    });

    const res = await request(app)
      .post("/project/progress")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ project_id: PROJECT_ID });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: payload });
    expect(progressDeps.recalculateFromTasks).toHaveBeenCalledTimes(1);
    expect(progressDeps.recalculateFromTasks).toHaveBeenCalledWith(PROJECT_ID, ORG_ID);
  });
});
