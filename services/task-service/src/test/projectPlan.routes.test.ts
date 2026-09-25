import { createExpressErrorHandler, ServiceError } from "@workspace/shared";
import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared/http";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createProjectPlanRoutes,
  type ProjectPlanRouteDeps,
} from "../routes/projectPlan.routes.js";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/task-service-test";
process.env.JWT_SECRET ??= "task-service-secret";
process.env.AUDIT_SERVICE_TOKEN = "audit-service-token";

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PLAN_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";

function createTestLogger() {
  return createLogger({
    service: "task-service-test",
    env: "test",
    destination: new MemoryLogStream(),
  });
}

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
  };
}

function createRouteDeps(): ProjectPlanRouteDeps {
  return {
    async create() {
      return { create: { id: PLAN_ID, name: "Plano", color: "#123456" } };
    },
    async list() {
      return [];
    },
    async update() {
      return { id: PLAN_ID, name: "Plano", color: "#123456" };
    },
    async detail() {
      return {
        detail: {
          id: PLAN_ID,
          name: "Plano",
          color: "#123456",
          tasks: [],
        },
      } as never;
    },
    async delete() {
      return { response: true };
    },
    async addTask() {
      return {
        create: {
          id: "33333333-3333-3333-3333-333333333333",
          plan_id: PLAN_ID,
          task_id: "44444444-4444-4444-4444-444444444444",
          order: 1,
          tasks: {
            id: "44444444-4444-4444-4444-444444444444",
            name: "Modelo",
            department_id: "dep-1",
            billing: "Realizar",
            prevision: 3,
            type: "regularize",
          },
        },
      } as never;
    },
    async listTasks() {
      return [];
    },
    async reorderTask() {
      return { message: "A tarefa já está no topo." };
    },
    async deleteTask() {
      return {
        deleted: {
          id: "33333333-3333-3333-3333-333333333333",
          plan_id: PLAN_ID,
          task_id: "44444444-4444-4444-4444-444444444444",
          order: 1,
          tasks: {
            id: "44444444-4444-4444-4444-444444444444",
            name: "Modelo",
            department_id: "dep-1",
            billing: "Realizar",
            prevision: 3,
            type: "regularize",
          },
        },
      } as never;
    },
    async hirePlan() {
      return { created: [] };
    },
  } as ProjectPlanRouteDeps;
}

function createTestApp(deps: ProjectPlanRouteDeps) {
  const app = express();
  const logger = createTestLogger();

  app.use(express.json());
  app.use("/task", createProjectPlanRoutes(deps));
  app.use(
    createExpressErrorHandler({
      logger,
      event: "task-service-test.error",
      fallbackMessage: "Erro interno no task-service.",
    }),
  );

  return app;
}

describe("projectPlan routes", () => {
  it("POST /task/project-plan sem autenticacao retorna 401", async () => {
    const app = createTestApp(createRouteDeps());

    const response = await request(app)
      .post("/task/project-plan")
      .set("Content-Type", "application/json")
      .send({ name: "Plano", color: "#123456" });

    expect(response.status).toBe(401);
  });

  it("POST /task/project-plan com auth do gateway chama create e retorna 201", async () => {
    let received: Record<string, unknown> | null = null;
    const deps = createRouteDeps();
    deps.create = async (data) => {
      received = data as unknown as Record<string, unknown>;
      return { create: { id: PLAN_ID, name: "Plano", color: "#123456" } };
    };
    const app = createTestApp(deps);

    const response = await request(app)
      .post("/task/project-plan")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ name: "Plano", color: "#123456" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: {
        create: { id: PLAN_ID, name: "Plano", color: "#123456" },
      },
    });
    expect(received).toEqual({
      user_id: USER_ID,
      organization_id: ORG_ID,
      integracaoLevel: 0,
      isOwner: false,
      name: "Plano",
      color: "#123456",
    });
  });

  it("GET /task/project-plan sem plan_id retorna 400", async () => {
    const app = createTestApp(createRouteDeps());
    const response = await request(app).get("/task/project-plan").set(gatewayHeaders());

    expect(response.status).toBe(400);
  });

  it("POST /task/project-plan/hire com auth do gateway chama hirePlan", async () => {
    let received: Record<string, unknown> | null = null;
    const deps = createRouteDeps();
    deps.hirePlan = async (data) => {
      received = data as unknown as Record<string, unknown>;
      return { created: [], idempotent: false };
    };
    const app = createTestApp(deps);

    const response = await request(app)
      .post("/task/project-plan/hire")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ plan_id: PLAN_ID, project_id: PROJECT_ID });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        created: [],
        idempotent: false,
      },
    });
    expect(received).toEqual({
      user_id: USER_ID,
      organization_id: ORG_ID,
      integracaoLevel: 0,
      isOwner: false,
      project_id: PROJECT_ID,
      plan_id: PLAN_ID,
    });
  });

  it("PUT /task/project-plan com auth do gateway chama update", async () => {
    let received: Record<string, unknown> | null = null;
    const deps = createRouteDeps();
    deps.update = async (data) => {
      received = data as unknown as Record<string, unknown>;
      return { id: PLAN_ID, name: "Plano atualizado", color: "#654321" };
    };
    const app = createTestApp(deps);

    const response = await request(app)
      .put("/task/project-plan")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ id: PLAN_ID, name: "Plano atualizado", color: "#654321" });

    expect(response.status).toBe(200);
    expect(received).toEqual({
      user_id: USER_ID,
      organization_id: ORG_ID,
      integracaoLevel: 0,
      isOwner: false,
      id: PLAN_ID,
      name: "Plano atualizado",
      color: "#654321",
    });
  });

  it("PUT /task/project-plan/task com auth do gateway encaminha user_id para reorderTask", async () => {
    let received: Record<string, unknown> | null = null;
    const deps = createRouteDeps();
    deps.reorderTask = async (data) => {
      received = data as unknown as Record<string, unknown>;
      return { message: "Reordenado." };
    };
    const app = createTestApp(deps);

    const response = await request(app)
      .put("/task/project-plan/task")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({
        plan_id: PLAN_ID,
        plan_task_id: "33333333-3333-3333-3333-333333333333",
        direction: "up",
      });

    expect(response.status).toBe(200);
    expect(received).toEqual({
      plan_id: PLAN_ID,
      plan_task_id: "33333333-3333-3333-3333-333333333333",
      direction: "up",
      user_id: USER_ID,
      organization_id: ORG_ID,
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("DELETE /task/project-plan/task com auth do gateway encaminha user_id para deleteTask", async () => {
    let received: Record<string, unknown> | null = null;
    const deps = createRouteDeps();
    deps.deleteTask = async (data) => {
      received = data as unknown as Record<string, unknown>;
      return {
        deleted: {
          id: "33333333-3333-3333-3333-333333333333",
          plan_id: PLAN_ID,
          task_id: "44444444-4444-4444-4444-444444444444",
          order: 1,
        },
      } as never;
    };
    const app = createTestApp(deps);

    const response = await request(app)
      .delete("/task/project-plan/task")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({
        plan_id: PLAN_ID,
        plan_task_id: "33333333-3333-3333-3333-333333333333",
      });

    expect(response.status).toBe(200);
    expect(received).toEqual({
      plan_id: PLAN_ID,
      plan_task_id: "33333333-3333-3333-3333-333333333333",
      user_id: USER_ID,
      organization_id: ORG_ID,
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("POST /task/project-plan retorna 403 quando o servico nega permissao", async () => {
    const deps = createRouteDeps();
    deps.create = async () => {
      throw new ServiceError(403, "Sem permissao.");
    };
    const app = createTestApp(deps);

    const response = await request(app)
      .post("/task/project-plan")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ name: "Plano", color: "#123456" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Sem permissao.",
    });
  });

  it("PUT /task/project-plan/task retorna 403 quando o servico nega permissao", async () => {
    const deps = createRouteDeps();
    deps.reorderTask = async () => {
      throw new ServiceError(403, "Sem permissao.");
    };
    const app = createTestApp(deps);

    const response = await request(app)
      .put("/task/project-plan/task")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({
        plan_id: PLAN_ID,
        plan_task_id: "33333333-3333-3333-3333-333333333333",
        direction: "up",
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Sem permissao.",
    });
  });

  it("DELETE /task/project-plan/task retorna 403 quando o servico nega permissao", async () => {
    const deps = createRouteDeps();
    deps.deleteTask = async () => {
      throw new ServiceError(403, "Sem permissao.");
    };
    const app = createTestApp(deps);

    const response = await request(app)
      .delete("/task/project-plan/task")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({
        plan_id: PLAN_ID,
        plan_task_id: "33333333-3333-3333-3333-333333333333",
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Sem permissao.",
    });
  });
});
