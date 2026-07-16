import "./envBootstrap.js";

import {
  createLogger,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createProjectApplication } from "../app.js";
import { getProjectServiceEnv } from "../config/env.js";
import type { ProjectCrudRouteDeps } from "../routes/projectCrud.routes.js";
import type { ProjectMetricsRouteDeps } from "../routes/projectMetrics.routes.js";
import type { ProjectProgressRouteDeps } from "../routes/projectProgress.routes.js";

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

const stubCrudDeps: ProjectCrudRouteDeps = {
  create: vi.fn(async () => ({ create: {} })),
  list: vi.fn(async () => []),
  update: vi.fn(async () => ({})),
  detail: vi.fn(async () => ({ detail: {} })),
  delete: vi.fn(async () => ({ response: {} })),
};

const stubProgressDeps: ProjectProgressRouteDeps = {
  recalculateFromTasks: vi.fn(async () => ({
    project: {
      id: "d0000000-0000-4000-8000-000000000001",
      status: "Em andamento",
      porcentage: 0,
      client_id: "b0000000-0000-4000-8000-000000000001",
    },
  })),
};

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
  };
}

describe("project-metrics routes", () => {
  it("GET /project/metrics sem token retorna 401", async () => {
    const metricsDeps: ProjectMetricsRouteDeps = {
      getGlobalMetrics: vi.fn(async () => ({
        total: 0,
        completed: 0,
        inProgress: 0,
        paused: 0,
        toDo: 0,
        notContracted: 0,
        taskMetrics: { total: 0, completed: 0, open: 0, paused: 0, emptyStatus: 0 },
      })),
    };
    const app = createProjectApplication({
      env,
      logger,
      projectCrudService: stubCrudDeps,
      projectMetricsService: metricsDeps,
      projectProgressService: stubProgressDeps,
    });

    const res = await request(app).get("/project/metrics");

    expect(res.status).toBe(401);
    expect(metricsDeps.getGlobalMetrics).not.toHaveBeenCalled();
  });

  it("GET /project/metrics com query desconhecida retorna 400", async () => {
    const metricsDeps: ProjectMetricsRouteDeps = {
      getGlobalMetrics: vi.fn(async () => ({
        total: 0,
        completed: 0,
        inProgress: 0,
        paused: 0,
        toDo: 0,
        notContracted: 0,
        taskMetrics: { total: 0, completed: 0, open: 0, paused: 0, emptyStatus: 0 },
      })),
    };
    const app = createProjectApplication({
      env,
      logger,
      projectCrudService: stubCrudDeps,
      projectMetricsService: metricsDeps,
      projectProgressService: stubProgressDeps,
    });

    const res = await request(app)
      .get("/project/metrics")
      .query({ ref: "client" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(metricsDeps.getGlobalMetrics).not.toHaveBeenCalled();
  });

  it("GET /project/metrics com auth gateway chama service e retorna 200", async () => {
    const payload = {
      total: 4,
      completed: 1,
      inProgress: 1,
      paused: 1,
      toDo: 1,
      notContracted: 0,
      taskMetrics: { total: 3, completed: 1, open: 1, paused: 1, emptyStatus: 0 },
    };
    const metricsDeps: ProjectMetricsRouteDeps = {
      getGlobalMetrics: vi.fn(async () => payload),
    };
    const app = createProjectApplication({
      env,
      logger,
      projectCrudService: stubCrudDeps,
      projectMetricsService: metricsDeps,
      projectProgressService: stubProgressDeps,
    });

    const res = await request(app).get("/project/metrics").set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: payload });
    expect(metricsDeps.getGlobalMetrics).toHaveBeenCalledTimes(1);
    expect(metricsDeps.getGlobalMetrics).toHaveBeenCalledWith(ORG_ID);
  });
});
