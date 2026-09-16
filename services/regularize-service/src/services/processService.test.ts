import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateProcessBody } from "../schemas/process.schemas.js";
import { calculateElapsedCalendarDays, ProcessService } from "./processService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "b0000000-0000-4000-8000-000000000001";
const clientPjId = "c0000000-0000-4000-8000-000000000001";
const clientPfId = "d0000000-0000-4000-8000-000000000001";
const processId = "e0000000-0000-4000-8000-000000000001";
const responsibleId = "f0000000-0000-4000-8000-000000000001";

function createBody(overrides: Partial<CreateProcessBody> = {}): CreateProcessBody {
  return {
    client_pj_id: clientPjId,
    cpf_cnpj: "12345678000199",
    process_type: "Abertura",
    description: "Descrição do processo",
    status: "Pendente",
    ...overrides,
  };
}

function createPrisma(overrides: Record<string, unknown> = {}) {
  return {
    client: {
      findFirst: vi.fn(async () => ({ id: clientPjId, cpf_cnpj: "12345678000199" })),
    },
    clientPF: {
      findFirst: vi.fn(async () => null),
    },
    process: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: processId, status: "Pendente" })),
      update: vi.fn(async () => ({ id: processId, status: "Pendente" })),
    },
    logs: {
      create: vi.fn(async () => ({})),
      findMany: vi.fn(async () => []),
    },
    user: {
      findMany: vi.fn(async () => []),
    },
    task: {
      findFirst: vi.fn(async () => ({ id: "10000000-0000-4000-8000-000000000001" })),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

describe("ProcessService", () => {
  it("rejects creation without exactly one client", async () => {
    const prisma = createPrisma();
    const service = new ProcessService(prisma);

    await expect(
      service.create({ organizationId, userId, body: createBody({ client_pj_id: undefined }) }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.create({
        organizationId,
        userId,
        body: createBody({ client_pf_id: clientPfId }),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.process.create).not.toHaveBeenCalled();
  });

  it("rejects a client from another organization", async () => {
    const prisma = createPrisma({
      client: { findFirst: vi.fn(async () => null) },
    });
    const service = new ProcessService(prisma);

    await expect(
      service.create({ organizationId, userId, body: createBody() }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.process.create).not.toHaveBeenCalled();
  });

  it("rejects when the process document does not match the selected client", async () => {
    const prisma = createPrisma({
      client: { findFirst: vi.fn(async () => ({ id: clientPjId, cpf_cnpj: "99887766000155" })) },
    });
    const service = new ProcessService(prisma);

    await expect(
      service.create({ organizationId, userId, body: createBody() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.process.create).not.toHaveBeenCalled();
  });

  it("accepts a formatted document when it matches the selected PF", async () => {
    const prisma = createPrisma({
      clientPF: {
        findFirst: vi.fn(async () => ({ id: clientPfId, cpf: "123.456.789-01" })),
      },
      process: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: processId, status: "Pendente" })),
      },
    });
    const service = new ProcessService(prisma);

    await expect(
      service.create({
        organizationId,
        userId,
        body: createBody({
          client_pj_id: undefined,
          client_pf_id: clientPfId,
          cpf_cnpj: "12345678901",
        }),
      }),
    ).resolves.toEqual({ create: { id: processId, status: "Pendente" } });
  });

  it("rejects a responsible that is not part of the organization", async () => {
    const prisma = createPrisma({
      user: { findMany: vi.fn(async () => []) },
    });
    const service = new ProcessService(prisma);

    await expect(
      service.create({
        organizationId,
        userId,
        body: createBody({ responsible1_id: responsibleId }),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.process.create).not.toHaveBeenCalled();
  });

  it("records explicit fiscal actions and returns them in the process timeline", async () => {
    const process = {
      id: processId,
      client_pj_id: clientPjId,
      client_pf_id: null,
      cpf_cnpj: "12345678000199",
      process_type: "Abertura",
      description: "Descrição do processo",
      entry_date: new Date("2026-01-01T00:00:00.000Z"),
      completion_date: new Date("2026-01-04T00:00:00.000Z"),
      expected_date: null,
      status: "Andamento",
      observation: null,
      responsible1_id: null,
      responsible2_id: null,
      responsible3_id: null,
      locking_type: null,
      urgency: null,
      task_id: null,
    };
    const logs = [
      { id: "log-2", action: "Retorno do Fiscal", date: new Date("2026-01-03T12:00:00.000Z") },
      { id: "log-1", action: "Envio ao Fiscal", date: new Date("2026-01-02T12:00:00.000Z") },
    ];
    const prisma = createPrisma({
      process: {
        findFirst: vi.fn(async () => process),
      },
      logs: {
        create: vi.fn(async () => ({})),
        findMany: vi.fn(async () => logs),
      },
    });
    const service = new ProcessService(prisma);

    await expect(service.sendToFiscal({ organizationId, userId, processId })).resolves.toEqual({
      process,
      action: "Envio ao Fiscal",
    });
    await expect(service.returnFromFiscal({ organizationId, userId, processId })).resolves.toEqual({
      process,
      action: "Retorno do Fiscal",
    });
    const detail = await service.detail(organizationId, processId);

    expect(prisma.logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "Envio ao Fiscal",
          referring: "regularize.process",
          referring_id: processId,
        }),
      }),
    );
    expect(detail).toMatchObject({
      detail: expect.objectContaining({ elapsed_days: 3, history: logs }),
    });
  });

  it("does not treat unchanged responsible relations as process changes", async () => {
    const responsible = { id: responsibleId, name: "Responsável" };
    const existing = { id: processId, responsible1: responsible };
    const updated = { id: processId, responsible1: { ...responsible } };
    const prisma = createPrisma({
      process: {
        findFirst: vi.fn(async () => existing),
        update: vi.fn(async () => updated),
      },
    });
    const service = new ProcessService(prisma);

    await service.update({
      organizationId,
      userId,
      body: { ...createBody(), id: processId },
    });

    expect(prisma.logs.create).not.toHaveBeenCalled();
  });

  it("calculates calendar days without mutating any record", () => {
    expect(
      calculateElapsedCalendarDays(
        new Date("2026-01-01T23:00:00.000Z"),
        new Date("2026-01-04T01:00:00.000Z"),
      ),
    ).toBe(3);
    expect(calculateElapsedCalendarDays(null, new Date("2026-01-04T00:00:00.000Z"))).toBeNull();
  });
});
