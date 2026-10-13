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

import { createAgendaRoutes } from "../routes/agenda.routes.js";
import { AgendaService } from "../services/agendaService.js";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/task-service-test";
process.env.JWT_SECRET ??= "task-service-secret";
process.env.AUDIT_SERVICE_TOKEN = "audit-service-token";

const ORG = "org-1";
const INTEGRACAO = "dep-integracao";

function setup() {
  const prisma = {
    department: { findMany: vi.fn().mockResolvedValue([{ id: INTEGRACAO, name: "Integração" }]) },
    agenda: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "evt-1", status: "Pendente", recurring_agenda_id: null }),
      create: vi.fn(async ({ data }) => ({ id: "evt-1", ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    recurringAgenda: { findMany: vi.fn().mockResolvedValue([]) },
    client: { count: vi.fn().mockResolvedValue(1) },
    user: { count: vi.fn().mockResolvedValue(1) },
  };
  const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use("/task", createAgendaRoutes(new AgendaService(prisma as never, audit as never)));
  app.use(
    createExpressErrorHandler({
      logger: createLogger({
        service: "agenda-route-test",
        env: "test",
        destination: new MemoryLogStream(),
      }),
      event: "agenda-route-test.error",
    }),
  );
  const headers = (level: number) => ({
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: "user-1",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG,
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: level, contabil: 3 }),
  });
  return { app, prisma, audit, headers };
}

describe("agenda Node HTTP (#1952)", () => {
  it("permite leitura ao nível 1 e nega 0 mesmo com outro módulo em nível 3", async () => {
    const { app, prisma, headers } = setup();
    const path = "/task/agenda?module=integracao&month=2026-12";

    expect((await request(app).get(path).set(headers(1))).status).toBe(200);
    expect(prisma.agenda.findMany.mock.calls[0][0].where).toMatchObject({
      organization_id: ORG,
      module: "integracao",
    });
    expect((await request(app).get(path).set(headers(0))).status).toBe(403);
    expect((await request(app).get(path)).status).toBe(401);
  });

  it("exige nível 2, cliente e primeiro par para criar", async () => {
    const { app, prisma, headers } = setup();
    const body = {
      module: "integracao",
      agenda: "Reunião",
      date: "2026-12-31T12:00:00.000Z",
      client_id: "client-1",
      participants: [{ department_id: INTEGRACAO, participant_id: "user-1" }],
    };

    expect((await request(app).post("/task/agenda").set(headers(1)).send(body)).status).toBe(403);
    expect((await request(app).post("/task/agenda").set(headers(2)).send(body)).status).toBe(201);
    expect(prisma.agenda.create.mock.calls[0][0].data).toMatchObject({
      module: "integracao",
      status: "Pendente",
      organization_id: ORG,
    });
    expect(
      (
        await request(app)
          .post("/task/agenda")
          .set(headers(2))
          .send({ ...body, client_id: null })
      ).status,
    ).toBe(400);
    expect(prisma.agenda.create).toHaveBeenCalledTimes(1);
  });

  it("edita somente evento do escopo e audita o estado", async () => {
    const { app, prisma, audit, headers } = setup();
    const body = { module: "integracao", agenda_id: "evt-1", status: "Agendada" };

    expect((await request(app).put("/task/agenda").set(headers(2)).send(body)).status).toBe(200);
    expect(prisma.agenda.updateMany.mock.calls[0][0].where).toEqual({
      id: "evt-1",
      organization_id: ORG,
      module: "integracao",
    });
    expect(audit.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        oldData: expect.objectContaining({ status: "Pendente" }),
        updatedData: { status: "Agendada" },
      }),
    );
    prisma.agenda.findFirst.mockResolvedValue(null);
    expect((await request(app).put("/task/agenda").set(headers(2)).send(body)).status).toBe(404);
  });
});
