/**
 * Postgres real: definir `PROJECT_SERVICE_INTEGRATION=1` e `DATABASE_URL` com o schema aplicado.
 * Sem estas variáveis, a suíte fica ignorada para preservar o ciclo unitário local.
 */
import "./envBootstrap.js";

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  createLogger,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createProjectApplication } from "../app.js";
import { getProjectServiceEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { ProjectCrudService } from "../services/projectCrudService.js";

const runIntegration = process.env.PROJECT_SERVICE_INTEGRATION === "1";

function gatewayHeaders(
  userId: string,
  organizationId: string,
  level: number,
  internalToken: string,
): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: internalToken,
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: "0",
    [FORWARDED_AUTH_TYPE_HEADER]: "user",
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: level }),
  };
}

describe.skipIf(!runIntegration)("project-service Postgres integration", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof createProjectApplication>;
  let organizationAId: string;
  let organizationBId: string;
  let userAId: string;
  let userBId: string;
  let clientBId: string;
  let projectBId: string;
  let taskBId: string;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl?.trim()) {
      throw new Error("DATABASE_URL é obrigatório quando PROJECT_SERVICE_INTEGRATION=1.");
    }

    const env = getProjectServiceEnv();
    const logger = createLogger({
      service: "project-service-integration",
      env: "test",
      level: "silent",
    });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const cnpj = (suffix: string) => `9${Date.now().toString().slice(-12)}${suffix}`;

    const organizationA = await prisma.organization.create({
      data: {
        name: `QA Projeto Alfa ${stamp}`,
        slug: `qa-projeto-alfa-${stamp}`,
        cnpj: cnpj("1"),
        email_created_by: `qa-projeto-alfa-${stamp}@example.com`,
      },
    });
    organizationAId = organizationA.id;

    const organizationB = await prisma.organization.create({
      data: {
        name: `QA Projeto Beta ${stamp}`,
        slug: `qa-projeto-beta-${stamp}`,
        cnpj: cnpj("2"),
        email_created_by: `qa-projeto-beta-${stamp}@example.com`,
      },
    });
    organizationBId = organizationB.id;

    const departmentA = await prisma.department.create({
      data: {
        name: `QA Projeto Alfa ${stamp}`,
        color: "#2563EB",
        status: "active",
        organization_id: organizationAId,
      },
    });
    const userA = await prisma.user.create({
      data: {
        name: `QA Projeto Usuário Alfa ${stamp}`,
        login: `qa-project-alfa-${stamp}`,
        password: "not-used-by-this-test",
        permission: 0,
        status: "active",
        type: "user",
        department_id: departmentA.id,
        organization_id: organizationAId,
      },
    });
    userAId = userA.id;

    const departmentB = await prisma.department.create({
      data: {
        name: `QA Projeto Beta ${stamp}`,
        color: "#2563EB",
        status: "active",
        organization_id: organizationBId,
      },
    });
    const userB = await prisma.user.create({
      data: {
        name: `QA Projeto Usuário ${stamp}`,
        login: `qa-project-${stamp}`,
        password: "not-used-by-this-test",
        permission: 0,
        status: "active",
        type: "user",
        department_id: departmentB.id,
        organization_id: organizationBId,
      },
    });
    userBId = userB.id;

    await prisma.client.create({
      data: {
        name: `Cliente QA Alfa ${stamp}`,
        organization_id: organizationAId,
        status: "Ativo",
        prospecting_status: "Lead",
        cpf_cnpj: "",
        service_unique: false,
      },
    });
    const clientB = await prisma.client.create({
      data: {
        name: `Cliente QA Beta ${stamp}`,
        organization_id: organizationBId,
        status: "Ativo",
        prospecting_status: "Lead",
        cpf_cnpj: "",
        service_unique: false,
      },
    });
    clientBId = clientB.id;

    const taskModelB = await prisma.taskModel.create({
      data: {
        name: `Modelo QA Beta ${stamp}`,
        department_id: departmentB.id,
        responsible_id: userB.id,
        billing: "Mensal",
        prevision: 5,
        type: "QA",
        organization_id: organizationBId,
      },
    });
    const projectB = await prisma.project.create({
      data: {
        name: `Projeto QA Beta ${stamp}`,
        client_id: clientBId,
        status: "Em Andamento",
        start_date: new Date("2026-07-01"),
        objective: "Isolamento e dependência",
        sponsor_id: userB.id,
        porcentage: 35,
        organization_id: organizationBId,
      },
    });
    projectBId = projectB.id;
    const taskB = await prisma.task.create({
      data: {
        model_id: taskModelB.id,
        project_id: projectBId,
        client_id: clientBId,
        name: `Tarefa dependente QA ${stamp}`,
        status: "Em Andamento",
        department_id: departmentB.id,
        billing: "Mensal",
        urgency: "Normal",
        responsible_id: userB.id,
        organization_id: organizationBId,
      },
    });
    taskBId = taskB.id;

    const projectCrudService = new ProjectCrudService(prisma, {
      createLog: async () => {},
      logUpdateIfChanged: async () => {},
    });
    app = createProjectApplication({ env, logger, projectCrudService });
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }

    if (organizationBId) {
      await prisma.task.deleteMany({ where: { organization_id: organizationBId } });
      await prisma.project.deleteMany({ where: { organization_id: organizationBId } });
      await prisma.taskModel.deleteMany({ where: { organization_id: organizationBId } });
      await prisma.client.deleteMany({ where: { organization_id: organizationBId } });
      await prisma.user.deleteMany({ where: { organization_id: organizationBId } });
      await prisma.department.deleteMany({ where: { organization_id: organizationBId } });
      await prisma.organization.delete({ where: { id: organizationBId } });
    }
    if (organizationAId) {
      await prisma.client.deleteMany({ where: { organization_id: organizationAId } });
      await prisma.user.deleteMany({ where: { organization_id: organizationAId } });
      await prisma.department.deleteMany({ where: { organization_id: organizationAId } });
      await prisma.organization.delete({ where: { id: organizationAId } });
    }
    await prisma.$disconnect();
  });

  it("executa list/detail/create/update com UUIDs válidos", async () => {
    const token = gatewayHeaders(
      userBId,
      organizationBId,
      1,
      getProjectServiceEnv().auditServiceToken,
    );

    const listResponse = await request(app)
      .get("/project/list")
      .query({ ref: "client", id: clientBId })
      .set(token);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: projectBId })]),
    );

    const detailResponse = await request(app)
      .get("/project")
      .query({ project_id: projectBId })
      .set(token);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.detail.id).toBe(projectBId);

    const blockedUpdate = await request(app)
      .put("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(userBId, organizationBId, 1, getProjectServiceEnv().auditServiceToken))
      .send({
        project_id: projectBId,
        name: "Não deve editar",
        start_date: "2026-07-01",
        end_date: "2026-08-01",
        objective: "403",
      });
    expect(blockedUpdate.status).toBe(403);

    const created = await request(app)
      .post("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(userBId, organizationBId, 2, getProjectServiceEnv().auditServiceToken))
      .send({
        name: "Projeto criado QA",
        client_id: clientBId,
        start_date: "2026-07-01",
        objective: "CRUD",
      });
    expect(created.status).toBe(201);
    expect(created.body.data.create.client_id).toBe(clientBId);

    const updated = await request(app)
      .put("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(userBId, organizationBId, 2, getProjectServiceEnv().auditServiceToken))
      .send({
        project_id: projectBId,
        name: "Projeto QA Beta atualizado",
        start_date: "2026-07-01",
        end_date: "2026-08-01",
        objective: "CRUD atualizado",
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe("Projeto QA Beta atualizado");
  });

  it("retorna 404 para recurso de outra organização", async () => {
    const response = await request(app)
      .get("/project")
      .query({ project_id: projectBId })
      .set(gatewayHeaders(userAId, organizationAId, 1, getProjectServiceEnv().auditServiceToken));

    expect(response.status).toBe(404);
  });

  it("retorna 409 e preserva a tarefa dependente", async () => {
    const response = await request(app)
      .delete("/project")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(userBId, organizationBId, 3, getProjectServiceEnv().auditServiceToken))
      .send({ project_id: projectBId });

    expect(response.status).toBe(409);
    expect(await prisma.project.findUnique({ where: { id: projectBId } })).not.toBeNull();
    expect(await prisma.task.findUnique({ where: { id: taskBId } })).not.toBeNull();
  });
});
