import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    task: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    taskFinanceiroCommand: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    departmentCollector: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    department: { findFirst: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  auditMock: {
    createLog: vi.fn(),
    logUpdateIfChanged: vi.fn(),
  },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);

import { TaskFinanceiroService } from "../services/taskFinanceiroService.js";

describe("TaskFinanceiroService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findFirst.mockResolvedValue({ department_id: "department-1" });
  });

  it("repetir a baixa com a mesma chave devolve o resultado registrado", async () => {
    const response = { task_ids: ["task-1"], settled: 1 };
    const commandHash = createHash("sha256").update(JSON.stringify({ task_ids: ["task-1"] })).digest("hex");
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.taskFinanceiroCommand.findUnique.mockResolvedValue({
      command_hash: commandHash,
      response_snapshot: response,
      audited_at: new Date(),
    });
    const service = new TaskFinanceiroService();

    await expect(
      service.settle({
        user_id: "user-1",
        organization_id: "org-1",
        task_ids: ["task-1"],
        idempotency_key: "settlement-key",
        integracao_level: 3,
      }),
    ).resolves.toEqual(response);

    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
    expect(auditMock.createLog).not.toHaveBeenCalled();
  });

  it("repete somente a auditoria quando a baixa anterior ficou sem evidência", async () => {
    const response = { task_ids: ["task-1"], settled: 1 };
    const commandHash = createHash("sha256").update(JSON.stringify({ task_ids: ["task-1"] })).digest("hex");
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.taskFinanceiroCommand.findUnique.mockResolvedValue({
      command_hash: commandHash,
      response_snapshot: response,
      audited_at: null,
    });
    const service = new TaskFinanceiroService();

    await expect(
      service.settle({
        user_id: "user-1",
        organization_id: "org-1",
        task_ids: ["task-1"],
        idempotency_key: "audit-retry-key",
        integracao_level: 3,
      }),
    ).resolves.toEqual(response);

    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.taskFinanceiroCommand.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { audited_at: expect.any(Date) } }),
    );
  });

  it("baixa em lote todas as tarefas pendentes no mesmo comando", async () => {
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.taskFinanceiroCommand.findUnique.mockResolvedValue(null);
    prismaMock.task.findMany.mockResolvedValue([
      { id: "task-1", department_id: "department-1", charge_financeiro: true },
      { id: "task-2", department_id: "department-1", charge_financeiro: true },
    ]);
    prismaMock.task.updateMany.mockResolvedValue({ count: 2 });
    const service = new TaskFinanceiroService();

    await expect(
      service.settle({
        user_id: "user-1",
        organization_id: "org-1",
        task_ids: ["task-2", "task-1"],
        idempotency_key: "batch-key",
        integracao_level: 3,
      }),
    ).resolves.toEqual({ task_ids: ["task-1", "task-2"], settled: 2 });

    expect(prismaMock.task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["task-1", "task-2"] }, organization_id: "org-1", charge_financeiro: true },
      data: { charge_financeiro: false },
    });
    expect(prismaMock.taskFinanceiroCommand.create).toHaveBeenCalled();
    expect(auditMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ required: true, referringId: "batch-key" }),
    );
  });

  it("rejeita a mesma chave quando o comando é diferente", async () => {
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.taskFinanceiroCommand.findUnique.mockResolvedValue({
      command_hash: "outro-comando",
      response_snapshot: { task_ids: ["task-1"], settled: 1 },
    });
    const service = new TaskFinanceiroService();

    await expect(
      service.settle({
        user_id: "user-1",
        organization_id: "org-1",
        task_ids: ["task-1"],
        idempotency_key: "reused-key",
        integracao_level: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
  });

  it("rejeita o lote inteiro quando uma tarefa já não está pendente", async () => {
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.taskFinanceiroCommand.findUnique.mockResolvedValue(null);
    prismaMock.task.findMany.mockResolvedValue([
      { id: "task-1", department_id: "department-1", charge_financeiro: true },
      { id: "task-2", department_id: "department-1", charge_financeiro: false },
    ]);
    const service = new TaskFinanceiroService();

    await expect(
      service.settle({
        user_id: "user-1",
        organization_id: "org-1",
        task_ids: ["task-1", "task-2"],
        idempotency_key: "invalid-batch-key",
        integracao_level: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.taskFinanceiroCommand.create).not.toHaveBeenCalled();
  });

  it("rejeita o lote quando uma tarefa é baixada concorrentemente antes da escrita", async () => {
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.taskFinanceiroCommand.findUnique.mockResolvedValue(null);
    prismaMock.task.findMany.mockResolvedValue([
      { id: "task-1", department_id: "department-1", charge_financeiro: true },
      { id: "task-2", department_id: "department-1", charge_financeiro: true },
    ]);
    prismaMock.task.updateMany.mockResolvedValue({ count: 1 });
    const service = new TaskFinanceiroService();

    await expect(
      service.settle({
        user_id: "user-1",
        organization_id: "org-1",
        task_ids: ["task-1", "task-2"],
        idempotency_key: "concurrent-batch-key",
        integracao_level: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.taskFinanceiroCommand.create).not.toHaveBeenCalled();
  });

  it("nega baixa a usuário que não é administrador nem cobrador autorizado", async () => {
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.taskFinanceiroCommand.findUnique.mockResolvedValue(null);
    prismaMock.task.findMany.mockResolvedValue([
      { id: "task-1", department_id: "department-1", charge_financeiro: true },
    ]);
    prismaMock.task.updateMany.mockResolvedValue({ count: 1 });
    const service = new TaskFinanceiroService();

    await expect(
      service.settle({
        user_id: "user-1",
        organization_id: "org-1",
        task_ids: ["task-1"],
        idempotency_key: "denied-key",
        integracao_level: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
  });

  it("permite que cobrador ativo baixe tarefa do próprio departamento", async () => {
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.taskFinanceiroCommand.findUnique.mockResolvedValue(null);
    prismaMock.task.findMany.mockResolvedValue([
      { id: "task-1", department_id: "department-1", charge_financeiro: true },
    ]);
    prismaMock.departmentCollector.findFirst.mockResolvedValue({ id: "collector-1" });
    prismaMock.task.updateMany.mockResolvedValue({ count: 1 });
    const service = new TaskFinanceiroService();

    await expect(
      service.settle({
        user_id: "user-1",
        organization_id: "org-1",
        task_ids: ["task-1"],
        idempotency_key: "collector-key",
        integracao_level: 1,
      }),
    ).resolves.toEqual({ task_ids: ["task-1"], settled: 1 });
  });

  it("administrador configura vários cobradores ativos do departamento", async () => {
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.department.findFirst.mockResolvedValue({ id: "department-1" });
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-1" }, { id: "user-2" }]);
    prismaMock.departmentCollector.createMany.mockResolvedValue({ count: 2 });
    const service = new TaskFinanceiroService();

    await expect(
      service.setCollectors({
        user_id: "admin-1",
        organization_id: "org-1",
        department_id: "department-1",
        collector_ids: ["user-1", "user-2"],
        integracao_level: 3,
      }),
    ).resolves.toEqual({ collector_ids: ["user-1", "user-2"], department_id: "department-1" });

    expect(prismaMock.departmentCollector.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", department_id: "department-1" },
    });
    expect(prismaMock.departmentCollector.createMany).toHaveBeenCalledWith({
      data: [
        { organization_id: "org-1", department_id: "department-1", user_id: "user-1" },
        { organization_id: "org-1", department_id: "department-1", user_id: "user-2" },
      ],
    });
    expect(auditMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ required: true, referringId: "department-1" }),
    );
  });

  it("limita a fila financeira ao departamento do cobrador", async () => {
    prismaMock.departmentCollector.findMany.mockResolvedValue([{ department_id: "department-1" }]);
    prismaMock.task.findMany.mockResolvedValue([]);
    const service = new TaskFinanceiroService();

    await service.listQueue({
      user_id: "user-1",
      organization_id: "org-1",
      integracao_level: 1,
    });

    expect(prismaMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ department_id: { in: ["department-1"] } }),
      }),
    );
  });

  it("rejeita fila para usuário sem departamento de cobrança", async () => {
    prismaMock.departmentCollector.findMany.mockResolvedValue([]);
    const service = new TaskFinanceiroService();

    await expect(
      service.listQueue({ user_id: "user-1", organization_id: "org-1", integracao_level: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("ignora vínculos do departamento anterior após transferência do cobrador", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ department_id: "department-new" });
    prismaMock.departmentCollector.findMany.mockResolvedValue([]);
    const service = new TaskFinanceiroService();

    await expect(
      service.listQueue({ user_id: "user-1", organization_id: "org-1", integracao_level: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prismaMock.departmentCollector.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ department_id: "department-new" }) }),
    );
  });

  it("rejeita baixa quando o cobrador foi transferido de departamento", async () => {
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.taskFinanceiroCommand.findUnique.mockResolvedValue(null);
    prismaMock.task.findMany.mockResolvedValue([
      { id: "task-1", department_id: "department-old", charge_financeiro: true },
    ]);
    prismaMock.user.findFirst.mockResolvedValue({ department_id: "department-new" });
    const service = new TaskFinanceiroService();

    await expect(
      service.settle({
        user_id: "user-1",
        organization_id: "org-1",
        task_ids: ["task-1"],
        idempotency_key: "transferred-collector-key",
        integracao_level: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
  });

  it("Baixa Express recompõe as tarefas pendentes do cliente no servidor", async () => {
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.task.findMany
      .mockResolvedValueOnce([{ id: "task-1" }])
      .mockResolvedValueOnce([
        { id: "task-1", department_id: "department-1", charge_financeiro: true },
      ]);
    prismaMock.taskFinanceiroCommand.findUnique.mockResolvedValue(null);
    prismaMock.task.updateMany.mockResolvedValue({ count: 1 });
    const service = new TaskFinanceiroService();

    await expect(
      service.settleExpress({
        user_id: "user-1",
        organization_id: "org-1",
        client_id: "client-1",
        idempotency_key: "express-key",
        integracao_level: 3,
      }),
    ).resolves.toEqual({ task_ids: ["task-1"], settled: 1 });

    expect(prismaMock.task.findMany.mock.calls[0]).toEqual([{
      where: { organization_id: "org-1", client_id: "client-1", charge_financeiro: true },
      select: { id: true },
    }]);
  });

  it("repetir Baixa Express devolve o snapshot mesmo sem pendências restantes", async () => {
    const response = { task_ids: ["task-1"], settled: 1 };
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.taskFinanceiroCommand.findUnique.mockResolvedValue({
      command_hash: createHash("sha256").update(JSON.stringify({ client_id: "client-1" })).digest("hex"),
      response_snapshot: response,
    });
    const service = new TaskFinanceiroService();

    await expect(
      service.settleExpress({
        user_id: "user-1",
        organization_id: "org-1",
        client_id: "client-1",
        idempotency_key: "express-replay-key",
        integracao_level: 3,
      }),
    ).resolves.toEqual(response);

    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
  });
});
