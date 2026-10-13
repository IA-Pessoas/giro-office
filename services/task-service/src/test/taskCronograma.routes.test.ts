import {
  createExpressErrorHandler,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createTaskCronogramaRoutes } from "../routes/taskCronograma.routes.js";
import { TaskCronogramaService } from "../services/taskCronogramaService.js";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/task-service-test";
process.env.JWT_SECRET ??= "task-service-secret";
process.env.AUDIT_SERVICE_TOKEN = "audit-service-token";

const clientId = "11111111-1111-4111-8111-111111111111";

function setup() {
  const prisma = {
    client: {
      findFirst: vi.fn().mockResolvedValue({ id: clientId, name: "Cliente A", company_name: null }),
    },
    task: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "task-1",
          name: "Entregar documentação",
          prevision_date: new Date("2025-12-01T12:00:00Z"),
        },
      ]),
    },
  };
  const app = express();
  app.use("/task", createTaskCronogramaRoutes(new TaskCronogramaService(prisma as never)));
  app.use(
    createExpressErrorHandler({
      logger: createLogger({
        service: "cronograma-route-test",
        env: "test",
        destination: new MemoryLogStream(),
      }),
      event: "cronograma-route-test.error",
    }),
  );
  const headers = (level: number) => ({
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: "user-1",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "org-1",
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: level, contabil: 3 }),
  });
  return { app, prisma, headers };
}

describe("cronograma Node HTTP (#1954)", () => {
  it("retorna o cliente e sua tarefa vencida para Integração nível 1", async () => {
    const { app, prisma, headers } = setup();
    const response = await request(app)
      .get("/task/cronograma")
      .query({ client_id: clientId })
      .set(headers(1));

    expect(response.status).toBe(200);
    expect(response.body.data.tasks).toEqual([
      { id: "task-1", name: "Entregar documentação", prevision_date: "2025-12-01T12:00:00.000Z" },
    ]);
    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({
      organization_id: "org-1",
      client_id: clientId,
    });
  });

  it("nega acesso sem Integração, consulta inválida e cliente fora da organização", async () => {
    const { app, prisma, headers } = setup();
    expect(
      (await request(app).get("/task/cronograma").query({ client_id: clientId }).set(headers(0)))
        .status,
    ).toBe(403);
    expect((await request(app).get("/task/cronograma").set(headers(1))).status).toBe(400);
    prisma.client.findFirst.mockResolvedValue(null);
    expect(
      (await request(app).get("/task/cronograma").query({ client_id: clientId }).set(headers(1)))
        .status,
    ).toBe(404);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
});
