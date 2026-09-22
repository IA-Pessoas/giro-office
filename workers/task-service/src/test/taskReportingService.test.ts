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
