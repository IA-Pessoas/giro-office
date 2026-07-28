import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { DepsTasksService } from "../services/depsTasksService.js";

describe("DepsTasksService", () => {
  it("lista departamentos ativos com modelos de tarefa por organizacao", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "dep-1", name: "Fiscal" }]);
    const service = new DepsTasksService({
      department: {
        findMany,
      },
    } as never);

    const result = await service.listDepartmentsWithTaskModels("org-1");

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        status: "Ativo",
        tasksModel: {
          some: {},
        },
      },
      select: {
        id: true,
        name: true,
        color: true,
        solution: true,
        tasksModel: true,
      },
      orderBy: {
        name: "asc",
      },
    });
    expect(result).toEqual([{ id: "dep-1", name: "Fiscal" }]);
  });

  it("envolve falha inesperada em ServiceError 500", async () => {
    const service = new DepsTasksService({
      department: {
        findMany: vi.fn().mockRejectedValue(new Error("db down")),
      },
    } as never);

    await expect(service.listDepartmentsWithTaskModels("org-1")).rejects.toMatchObject({
      statusCode: 500,
    });
    await expect(service.listDepartmentsWithTaskModels("org-1")).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it("lista usuários e departamentos ativos da organização para o formulário de modelos", async () => {
    const userFindMany = vi.fn().mockResolvedValue([{ id: "user-1", name: "Ana" }]);
    const departmentFindMany = vi.fn().mockResolvedValue([{ id: "dep-1", name: "Fiscal" }]);
    const service = new DepsTasksService({
      user: { findMany: userFindMany },
      department: { findMany: departmentFindMany },
    } as never);

    const result = await service.listTaskModelOptions("org-1");

    expect(userFindMany).toHaveBeenCalledWith({
      where: {
        status: "active",
        OR: [{ organization_id: "org-1" }, { department: { organization_id: "org-1" } }],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    expect(departmentFindMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", status: "Ativo" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    expect(result).toEqual({
      users: [{ id: "user-1", name: "Ana" }],
      departments: [{ id: "dep-1", name: "Fiscal" }],
    });
  });
});
