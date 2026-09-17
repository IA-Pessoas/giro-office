import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
    task: { findFirst: vi.fn(), update: vi.fn() },
    taskPostponement: { create: vi.fn(), findMany: vi.fn() },
    permission: { findMany: vi.fn() },
    pessoalNotification: { createMany: vi.fn() },
  },
  auditMock: { createLog: vi.fn() },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);

import { TaskPostponementService } from "../services/taskPostponementService.js";

const task = {
  id: "task-1",
  organization_id: "org-1",
  status: "Em Andamento",
  prevision_date: new Date("2026-09-10T00:00:00.000Z"),
  responsible_id: "user-1",
  responsible2_id: "user-2",
  responsible3_id: null,
};

describe("TaskPostponementService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.task.findFirst.mockResolvedValue(task);
    prismaMock.taskPostponement.create.mockResolvedValue({
      id: "postponement-1",
      previous_prevision_date: task.prevision_date,
      new_prevision_date: new Date("2026-09-20T00:00:00.000Z"),
      justification: "Aguardando documento do cliente.",
      author_id: "user-1",
      created_at: new Date("2026-09-17T12:00:00.000Z"),
    });
    prismaMock.permission.findMany.mockResolvedValue([{ user_id: "admin-1" }]);
    prismaMock.pessoalNotification.createMany.mockResolvedValue({ count: 3 });
  });

  it("prorroga em uma transação, preserva o histórico e notifica responsáveis e admin", async () => {
    const service = new TaskPostponementService(() => new Date("2026-10-01T12:00:00.000Z"));

    await expect(
      service.create({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        new_prevision_date: "2026-09-20",
        justification: "Aguardando documento do cliente.",
        integracaoLevel: 0,
      }),
    ).resolves.toMatchObject({
      id: "postponement-1",
      previous_prevision_date: task.prevision_date,
      new_prevision_date: new Date("2026-09-20T00:00:00.000Z"),
    });

    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { prevision_date: new Date("2026-09-20T00:00:00.000Z") },
    });
    expect(auditMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Prorrogação de Tarefa",
        organizationId: "org-1",
        referring: "integracao.task_postponements",
        required: true,
      }),
    );
    expect(prismaMock.pessoalNotification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ user_id: "user-1", regarding: "task_postponement" }),
          expect.objectContaining({ user_id: "user-2", regarding: "task_postponement" }),
          expect.objectContaining({ user_id: "admin-1", regarding: "task_postponement" }),
        ]),
        skipDuplicates: true,
      }),
    );
  });

  it("rejeita tarefa sem elegibilidade ou previsão que não avança", async () => {
    const service = new TaskPostponementService(() => new Date("2026-09-17T12:00:00.000Z"));
    prismaMock.task.findFirst.mockResolvedValueOnce({ ...task, status: "Paralisado" });

    await expect(
      service.create({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        new_prevision_date: "2026-09-20",
        justification: "Aguardando documento do cliente.",
        integracaoLevel: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    prismaMock.task.findFirst.mockResolvedValueOnce(task);
    await expect(
      service.create({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        new_prevision_date: "2026-09-10",
        justification: "Aguardando documento do cliente.",
        integracaoLevel: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.taskPostponement.create).not.toHaveBeenCalled();
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("rejeita previsão que ainda não venceu", async () => {
    const service = new TaskPostponementService(() => new Date("2026-09-17T12:00:00.000Z"));
    prismaMock.task.findFirst.mockResolvedValueOnce({
      ...task,
      prevision_date: new Date("2026-09-17T00:00:00.000Z"),
    });

    await expect(
      service.create({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        new_prevision_date: "2026-09-20",
        justification: "Aguardando documento do cliente.",
        integracaoLevel: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.taskPostponement.create).not.toHaveBeenCalled();
  });

  it("não revela nem altera tarefa de outra organização", async () => {
    const service = new TaskPostponementService();
    prismaMock.task.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        user_id: "user-1",
        organization_id: "org-2",
        task_id: "task-1",
        new_prevision_date: "2026-09-20",
        justification: "Aguardando documento do cliente.",
        integracaoLevel: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prismaMock.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "task-1", organization_id: "org-2" } }),
    );
    expect(prismaMock.taskPostponement.create).not.toHaveBeenCalled();
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("usa a previsão atual de cada prorrogação como histórico da próxima", async () => {
    const service = new TaskPostponementService(() => new Date("2026-10-01T12:00:00.000Z"));
    const secondCurrentDate = new Date("2026-09-20T00:00:00.000Z");
    prismaMock.task.findFirst
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce({ ...task, prevision_date: secondCurrentDate });

    await service.create({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      new_prevision_date: "2026-09-20",
      justification: "Primeira prorrogação.",
      integracaoLevel: 0,
    });
    await service.create({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      new_prevision_date: "2026-10-10",
      justification: "Segunda prorrogação.",
      integracaoLevel: 0,
    });

    expect(prismaMock.taskPostponement.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ previous_prevision_date: secondCurrentDate }),
      }),
    );
    expect(prismaMock.task.update).toHaveBeenLastCalledWith({
      where: { id: "task-1" },
      data: { prevision_date: new Date("2026-10-10T00:00:00.000Z") },
    });
  });

  it("lista as prorrogações em ordem cronológica", async () => {
    const service = new TaskPostponementService();
    const history = [{ id: "first" }, { id: "second" }];
    prismaMock.taskPostponement.findMany.mockResolvedValue(history);

    await expect(
      service.list({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        integracaoLevel: 0,
      }),
    ).resolves.toEqual(history);

    expect(prismaMock.taskPostponement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: "asc" } }),
    );
  });
});
