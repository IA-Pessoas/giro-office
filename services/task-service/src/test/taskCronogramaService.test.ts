import { describe, expect, it, vi } from "vitest";

import { TaskCronogramaService } from "../services/taskCronogramaService.js";

const organizationId = "org-1";
const clientId = "client-1";
const reader = { organizationId, userId: "user-1", level: 1, isOwner: false } as const;

function setup() {
  const prisma = {
    client: {
      findFirst: vi.fn().mockResolvedValue({
        id: clientId,
        name: "Cliente A",
        company_name: "Empresa A",
      }),
    },
    task: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "task-late",
          name: "Regularizar cadastro",
          prevision_date: new Date("2025-12-01T12:00:00Z"),
        },
        {
          id: "task-future",
          name: "Enviar documentos",
          prevision_date: new Date("2027-01-20T12:00:00Z"),
        },
      ]),
    },
  };
  return { prisma, service: new TaskCronogramaService(prisma as never) };
}

describe("TaskCronogramaService (#1954)", () => {
  it("consulta todas as tarefas em andamento com previsão do cliente, inclusive vencidas", async () => {
    const { prisma, service } = setup();
    const result = await service.list(reader, clientId);

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true, name: true, company_name: true },
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        client_id: clientId,
        status: { equals: "Em Andamento", mode: "insensitive" },
        prevision_date: { not: null },
      },
      select: { id: true, name: true, prevision_date: true },
      orderBy: [{ prevision_date: "asc" }, { name: "asc" }, { id: "asc" }],
    });
    expect(result).toEqual({
      client: { id: clientId, name: "Cliente A", company_name: "Empresa A" },
      tasks: [
        {
          id: "task-late",
          name: "Regularizar cadastro",
          prevision_date: "2025-12-01T12:00:00.000Z",
        },
        {
          id: "task-future",
          name: "Enviar documentos",
          prevision_date: "2027-01-20T12:00:00.000Z",
        },
      ],
    });
  });

  it("nega nível 0 e cliente de outra organização sem consultar tarefas", async () => {
    const { prisma, service } = setup();
    await expect(service.list({ ...reader, level: 0 }, clientId)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    prisma.client.findFirst.mockResolvedValue(null);
    await expect(service.list(reader, "client-other")).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
});
