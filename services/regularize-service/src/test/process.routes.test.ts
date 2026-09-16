import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

const processId = "e0000000-0000-4000-8000-000000000001";

function createPrisma() {
  return {
    process: {
      findFirst: vi.fn(async () => ({
        id: processId,
        client_pj_id: "c0000000-0000-4000-8000-000000000001",
        client_pf_id: null,
        cpf_cnpj: "12345678000199",
        process_type: "Abertura",
        description: "Descrição",
        entry_date: new Date("2026-01-01T00:00:00.000Z"),
        completion_date: null,
        expected_date: null,
        status: "Andamento",
        observation: null,
        responsible1_id: null,
        responsible2_id: null,
        responsible3_id: null,
        locking_type: null,
        urgency: null,
        task_id: null,
      })),
    },
    logs: {
      create: vi.fn(async () => ({})),
      findMany: vi.fn(async () => []),
    },
  } as unknown as PrismaClient;
}

describe("regularize process routes", () => {
  it("rejects a process creation without a selected client", async () => {
    const app = createTestApp(createPrisma());

    const response = await request(app).post("/regularize/process").set(gatewayHeaders()).send({
      cpf_cnpj: "12345678000199",
      process_type: "Abertura",
      description: "Descrição",
      status: "Pendente",
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("records sending a process to Fiscal as an explicit action", async () => {
    const prisma = createPrisma();
    const app = createTestApp(prisma);

    const response = await request(app)
      .post("/regularize/process/send-to-fiscal")
      .set(gatewayHeaders())
      .send({ id: processId });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { action: "Envio ao Fiscal", process: { id: processId } },
    });
    expect(prisma.logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "Envio ao Fiscal", referring_id: processId }),
      }),
    );
  });

  it("records the Fiscal return without changing the process status", async () => {
    const prisma = createPrisma();
    const app = createTestApp(prisma);

    const response = await request(app)
      .post("/regularize/process/return-from-fiscal")
      .set(gatewayHeaders())
      .send({ id: processId });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { action: "Retorno do Fiscal", process: { id: processId, status: "Andamento" } },
    });
    expect(prisma.process.update).toBeUndefined();
  });

  it("does not allow a viewer to record a Fiscal action", async () => {
    const prisma = createPrisma();
    const app = createTestApp(prisma);

    const response = await request(app)
      .post("/regularize/process/send-to-fiscal")
      .set(gatewayHeaders({ permission: 1 }))
      .send({ id: processId });

    expect(response.status).toBe(403);
    expect(prisma.process.findFirst).not.toHaveBeenCalled();
    expect(prisma.logs.create).not.toHaveBeenCalled();
  });
});
