import { expect, it, vi } from "vitest";
import { TaskReportingService } from "../services/taskReportingService.js";

it("relatórios não filtram tarefas sem responsável nem publicam chaves internas", async () => {
  const findMany = vi.fn(async () => [
    { name: "Tarefa sem atribuição", department: { name: "Fiscal" }, end_date: null },
  ]);
  const result = await new TaskReportingService({ task: { findMany } }).extract({
    organizationId: "org-1",
    source: "integracao.tasks",
    fields: ["name", "department", "end_date"],
    limit: 10,
  });
  expect(result.rows).toEqual([
    { name: "Tarefa sem atribuição", department: "Fiscal", end_date: null },
  ]);
  expect(findMany).toHaveBeenCalledWith({
    where: { organization_id: "org-1" },
    select: { name: true, department: { select: { name: true } }, end_date: true },
    take: 11,
  });
});

it("conta tarefas pelo departamento vigente e limita a consulta à organização", async () => {
  const findMany = vi.fn(async ({ where }: { where: { organization_id: string } }) =>
    [
      { organization_id: "org-1", department: { name: "Fiscal" } },
      { organization_id: "org-1", department: { name: "Pessoal" } },
      { organization_id: "org-1", department: { name: "Fiscal" } },
      { organization_id: "org-2", department: { name: "Fiscal" } },
    ]
      .filter((task) => task.organization_id === where.organization_id)
      .map(({ department }) => ({ department })),
  );
  const prisma = { task: { findMany } };
  const db = Object.assign(prisma, {
    $transaction: async (read: (transaction: typeof prisma) => Promise<unknown>) => read(prisma),
  });
  const result = await new TaskReportingService(db).extract({
    organizationId: "org-1",
    source: "integracao.tasks",
    fields: ["department"],
    limit: 10,
    query: {
      group_by: ["department"],
      aggregations: [{ field: "department", function: "count", alias: "task_count" }],
      order_by: [{ field: "department", direction: "asc" }],
    },
  });

  expect(result).toEqual({
    rows: [
      { department: "Fiscal", task_count: 2 },
      { department: "Pessoal", task_count: 1 },
    ],
    reachedLimit: false,
  });
  expect(findMany).toHaveBeenCalledWith({
    where: { organization_id: "org-1" },
    select: { department: { select: { name: true } } },
    skip: 0,
    orderBy: { id: "asc" },
    take: 101,
  });
});

it("retorna relatório vazio válido quando a organização não tem tarefas", async () => {
  const prisma = { task: { findMany: vi.fn(async () => []) } };
  const db = Object.assign(prisma, {
    $transaction: async (read: (transaction: typeof prisma) => Promise<unknown>) => read(prisma),
  });
  const result = await new TaskReportingService(db).extract({
    organizationId: "org-1",
    source: "integracao.tasks",
    fields: ["department"],
    limit: 10,
    query: {
      group_by: ["department"],
      aggregations: [{ field: "department", function: "count", alias: "task_count" }],
    },
  });

  expect(result).toEqual({ rows: [], reachedLimit: false });
});
