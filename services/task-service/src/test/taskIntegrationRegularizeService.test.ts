import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    taskModel: {
      findFirst: vi.fn(),
    },
    process: { findFirst: vi.fn(), findMany: vi.fn() },
    license: { findFirst: vi.fn(), findMany: vi.fn() },
    tasksIntegrationRegularize: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
  auditMock: {
    createLog: vi.fn(),
  },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);

import { TaskIntegrationRegularizeService } from "../services/taskIntegrationRegularizeService.js";

describe("TaskIntegrationRegularizeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.taskModel.findFirst.mockResolvedValue({ id: "model-1", name: "Modelo" });
  });

  it("createLink lança 404 quando modelo não existe", async () => {
    prismaMock.taskModel.findFirst.mockResolvedValue(null);
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.createLink({
        user_id: "user-1",
        organization_id: "org-1",
        task_model_id: "model-1",
        referring: "regularize",
        referring_type: "folder",
        integracaoLevel: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("removeLink lança 404 quando vínculo não existe", async () => {
    prismaMock.tasksIntegrationRegularize.deleteMany.mockResolvedValue({ count: 0 });
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.removeLink({
        user_id: "user-1",
        organization_id: "org-1",
        integration_id: "integration-1",
        integracaoLevel: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("aceita somente processo ou licença existentes na organização", async () => {
    prismaMock.taskModel.findFirst.mockResolvedValue({ name: "Modelo" });
    prismaMock.tasksIntegrationRegularize.findFirst.mockResolvedValue(null);
    prismaMock.process.findFirst.mockResolvedValue({ id: "process-1" });
    prismaMock.tasksIntegrationRegularize.create.mockResolvedValue({ id: "link-1" });
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.createLink({
        user_id: "user-1",
        organization_id: "org-1",
        task_model_id: "model-1",
        referring: "process-1",
        referring_type: "process",
        integracaoLevel: 3,
      }),
    ).resolves.toMatchObject({ integration: { id: "link-1" } });

    expect(prismaMock.process.findFirst).toHaveBeenCalledWith({
      where: { id: "process-1", organization_id: "org-1" },
      select: { id: true },
    });
    expect(auditMock.createLog).toHaveBeenCalledWith(expect.objectContaining({ required: true }));

    prismaMock.license.findFirst.mockResolvedValue({ id: "license-1" });
    await expect(
      service.createLink({
        user_id: "user-1",
        organization_id: "org-1",
        task_model_id: "model-1",
        referring: "license-1",
        referring_type: "license",
        integracaoLevel: 3,
      }),
    ).resolves.toMatchObject({ integration: { id: "link-1" } });
    expect(prismaMock.license.findFirst).toHaveBeenCalledWith({
      where: { id: "license-1", organization_id: "org-1" },
      select: { id: true },
    });

    await expect(
      service.createLink({
        user_id: "user-1",
        organization_id: "org-1",
        task_model_id: "model-1",
        referring: "other-1",
        referring_type: "folder",
        integracaoLevel: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejeita destino Regularize de outra organização sem criar vínculo", async () => {
    prismaMock.taskModel.findFirst.mockResolvedValue({ name: "Modelo" });
    prismaMock.process.findFirst.mockResolvedValue(null);
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.createLink({
        user_id: "user-1",
        organization_id: "org-1",
        task_model_id: "model-1",
        referring: "process-org-2",
        referring_type: "process",
        integracaoLevel: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prismaMock.tasksIntegrationRegularize.create).not.toHaveBeenCalled();
  });

  it("converte colisão do índice único em conflito", async () => {
    prismaMock.process.findFirst.mockResolvedValue({ id: "process-1" });
    prismaMock.tasksIntegrationRegularize.findFirst.mockResolvedValue(null);
    prismaMock.tasksIntegrationRegularize.create.mockRejectedValue({ code: "P2002" });
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.createLink({
        user_id: "user-1",
        organization_id: "org-1",
        task_model_id: "model-1",
        referring: "process-1",
        referring_type: "process",
        integracaoLevel: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejeita listagem de modelo de outra organização", async () => {
    prismaMock.taskModel.findFirst.mockResolvedValue(null);
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.list("org-1", "model-org-2", { userId: "user-1", integracaoLevel: 1 }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prismaMock.tasksIntegrationRegularize.findMany).not.toHaveBeenCalled();
  });

  it("rejeita listagem sem permissão de Integração", async () => {
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.list("org-1", "model-1", { userId: "user-1", integracaoLevel: 0 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("mantém vínculo quando destino Regularize não está mais disponível", async () => {
    prismaMock.tasksIntegrationRegularize.findMany.mockResolvedValue([
      { id: "link-1", referring: "process-missing", referring_type: "process" },
    ]);
    prismaMock.process.findMany.mockResolvedValue([]);
    prismaMock.license.findMany.mockResolvedValue([]);
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.list("org-1", "model-1", {
        userId: "user-1",
        integracaoLevel: 1,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: "link-1", available: false })]);
  });

  it("não confunde IDs iguais entre processo e licença", async () => {
    prismaMock.tasksIntegrationRegularize.findMany.mockResolvedValue([
      { id: "link-1", referring: "same-id", referring_type: "process" },
    ]);
    prismaMock.process.findMany.mockResolvedValue([]);
    prismaMock.license.findMany.mockResolvedValue([{ id: "same-id" }]);
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.list("org-1", "model-1", {
        userId: "user-1",
        integracaoLevel: 1,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: "link-1", available: false })]);
  });

  it("exige auditoria ao remover vínculo", async () => {
    prismaMock.tasksIntegrationRegularize.findFirst.mockResolvedValue({
      task_model_id: "model-1",
      referring: "process-1",
      referring_type: "process",
    });
    prismaMock.tasksIntegrationRegularize.deleteMany.mockResolvedValue({ count: 1 });
    const service = new TaskIntegrationRegularizeService();

    await expect(
      service.removeLink({
        user_id: "user-1",
        organization_id: "org-1",
        integration_id: "integration-1",
        integracaoLevel: 3,
      }),
    ).resolves.toEqual({ message: "Vínculo removido com sucesso." });

    expect(auditMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        required: true,
        changes: {
          task_model_id: "model-1",
          referring: "process-1",
          referring_type: "process",
        },
      }),
    );
  });
});
