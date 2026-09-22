import { describe, expect, it, vi } from "vitest";

import { TaskReportingService } from "../services/taskReportingService.js";

const organizationId = "00000000-0000-4000-8000-000000000001";

describe("TaskReportingService", () => {
  it("extrai campos publicados somente da organização do grant, com nome do departamento e corte", async () => {
    const task = {
      findMany: vi.fn().mockResolvedValue([
        { name: "Tarefa A", department: { name: "Fiscal" } },
        { name: "Tarefa B", department: { name: "Contábil" } },
        { name: "Tarefa fora do limite", department: { name: "TI" } },
      ]),
    };
    const service = new TaskReportingService({ task } as never);

    await expect(
      service.extract({
        organizationId,
        source: "integracao.tasks",
        fields: ["name", "department"],
        limit: 2,
      }),
    ).resolves.toEqual({
      rows: [
        { name: "Tarefa A", department: "Fiscal" },
        { name: "Tarefa B", department: "Contábil" },
      ],
      reachedLimit: true,
    });

    expect(task.findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { name: true, department: { select: { name: true } } },
      take: 3,
    });
  });

  it("recusa chaves internas como projeção de relatório", async () => {
    const task = { findMany: vi.fn() };
    const service = new TaskReportingService({ task } as never);

    await expect(
      service.extract({
        organizationId,
        source: "integracao.tasks",
        fields: ["project_id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(task.findMany).not.toHaveBeenCalled();
  });
});
