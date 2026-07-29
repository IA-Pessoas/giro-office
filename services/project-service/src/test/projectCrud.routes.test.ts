import "./envBootstrap.js";

import {
  FORWARDED_AUTH_MODULES_HEADER,
  createLogger,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createProjectApplication } from "../app.js";
import { getProjectServiceEnv } from "../config/env.js";
import type { ProjectCrudRouteDeps } from "../routes/projectCrud.routes.js";
import { ProjectCrudService, type ProjectCrudPrisma } from "../services/projectCrudService.js";

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

function gatewayHeaders(
  level = 2,
  organizationId = ORG_ID,
  type: "owner" | "admin" | "user" = "user",
): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(level),
    [FORWARDED_AUTH_TYPE_HEADER]: type,
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: level }),
  };
}

function createProjectService() {
  const prisma = {
    client: {
      findFirst: vi.fn(async () => ({ id: "b0000000-0000-4000-8000-000000000001" })),
    },
    project: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: "d0000000-0000-4000-8000-000000000001" })),
      update: vi.fn(async () => ({ id: "d0000000-0000-4000-8000-000000000001" })),
      delete: vi.fn(async () => ({ id: "d0000000-0000-4000-8000-000000000001" })),
    },
  } as unknown as ProjectCrudPrisma;
  const audit = {
    createLog: vi.fn(async () => {}),
    logUpdateIfChanged: vi.fn(async () => {}),
  };

  return { prisma, service: new ProjectCrudService(prisma, audit) };
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

  it("POST /project bloqueia nível 1 e permite nível 2", async () => {
    const blocked = createProjectService();
    const blockedApp = createProjectApplication({
      env,
      logger,
      projectCrudService: blocked.service,
    });
    const body = {
      name: "Novo",
      client_id: "b0000000-0000-4000-8000-000000000001",
      start_date: "2025-02-01",
      objective: "obj",
    };

    const blockedResponse = await request(blockedApp)
      .post("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send(body);

    expect(blockedResponse.status).toBe(403);

    const allowed = createProjectService();
    const allowedResponse = await request(
      createProjectApplication({ env, logger, projectCrudService: allowed.service }),
    )
      .post("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(2))
      .send(body);

    expect(allowedResponse.status).toBe(201);
  });

  it("PUT /project permite edição no nível 2 e bloqueia nível 1", async () => {
    const blocked = createProjectService();
    blocked.prisma.project.findFirst = vi.fn(async () => ({ id: "project-1" }));
    const body = {
      project_id: "d0000000-0000-4000-8000-000000000001",
      name: "Atualizado",
      start_date: "2025-02-01",
      end_date: "2025-03-01",
      objective: "obj",
    };

    const blockedResponse = await request(
      createProjectApplication({ env, logger, projectCrudService: blocked.service }),
    )
      .put("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send(body);

    expect(blockedResponse.status).toBe(403);

    const allowed = createProjectService();
    allowed.prisma.project.findFirst = vi.fn(async () => ({ id: "project-1" }));
    const allowedResponse = await request(
      createProjectApplication({ env, logger, projectCrudService: allowed.service }),
    )
      .put("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(2))
      .send(body);

    expect(allowedResponse.status).toBe(200);
  });

  it("DELETE /project exige nível 3 e mantém isolamento de organização", async () => {
    const blocked = createProjectService();
    blocked.prisma.project.findFirst = vi.fn(async () => ({ id: "project-1" }));
    const app = createProjectApplication({ env, logger, projectCrudService: blocked.service });
    const body = { project_id: "d0000000-0000-4000-8000-000000000001" };

    const blockedResponse = await request(app)
      .delete("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(2))
      .send(body);

    expect(blockedResponse.status).toBe(403);

    const crossOrg = createProjectService();
    crossOrg.prisma.project.findFirst = vi.fn(async () => null);
    const crossOrgResponse = await request(
      createProjectApplication({ env, logger, projectCrudService: crossOrg.service }),
    )
      .delete("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(3, "b0000000-0000-4000-8000-000000000099"))
      .send(body);

    expect(crossOrgResponse.status).toBe(404);
  });

  it("POST /project retorna 409 para duplicidade de projeto", async () => {
    const duplicate = createProjectService();
    duplicate.prisma.project.findFirst = vi.fn(async () => ({ id: "project-1" }));
    const response = await request(
      createProjectApplication({ env, logger, projectCrudService: duplicate.service }),
    )
      .post("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(2))
      .send({
        name: "Novo",
        client_id: "b0000000-0000-4000-8000-000000000001",
        start_date: "2025-02-01",
        objective: "obj",
      });

    expect(response.status).toBe(409);
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
