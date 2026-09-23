import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
    task: { findFirst: vi.fn() },
    taskAttachment: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  },
  auditMock: { createLog: vi.fn() },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);

import { TaskAttachmentService } from "../services/taskAttachmentService.js";

const task = {
  id: "task-1",
  organization_id: "org-1",
  responsible_id: "user-1",
  responsible2_id: null,
  responsible3_id: null,
};

describe("TaskAttachmentService", () => {
  const storage = {
    upload: vi.fn(),
    createSignedAccessUrl: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.task.findFirst.mockResolvedValue(task);
    prismaMock.taskAttachment.create.mockResolvedValue({
      id: "attachment-1",
      original_name: "evidencia.pdf",
      mime_type: "application/pdf",
      size_bytes: 5,
      created_at: new Date("2026-09-17T00:00:00Z"),
    });
    storage.upload.mockResolvedValue("integracao/organizations/org-1/tasks/task-1/file.pdf");
  });

  it("compensa o objeto privado quando a persistência falha", async () => {
    prismaMock.taskAttachment.create.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      new TaskAttachmentService(storage, prismaMock as never, auditMock as never).upload({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        integracaoLevel: 0,
        file: {
          buffer: Buffer.from("%PDF-"),
          mimetype: "application/pdf",
          originalname: "evidencia.pdf",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 500 });

    expect(storage.remove).toHaveBeenCalledWith(
      "integracao/organizations/org-1/tasks/task-1/file.pdf",
    );
    expect(auditMock.createLog).not.toHaveBeenCalled();
  });

  it("gera acesso apenas para metadado ativo da mesma tarefa", async () => {
    prismaMock.taskAttachment.findFirst.mockResolvedValue({
      id: "attachment-1",
      object_path: "integracao/organizations/org-1/tasks/task-1/file.pdf",
    });
    storage.createSignedAccessUrl.mockResolvedValue("https://signed.example/file");

    await expect(
      new TaskAttachmentService(storage, prismaMock as never, auditMock as never).createAccessUrl({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        attachment_id: "attachment-1",
        integracaoLevel: 0,
      }),
    ).resolves.toEqual({ url: "https://signed.example/file" });

    expect(prismaMock.taskAttachment.findFirst).toHaveBeenCalledWith({
      where: {
        id: "attachment-1",
        task_id: "task-1",
        organization_id: "org-1",
        deleted_at: null,
      },
      select: { id: true, object_path: true },
    });
  });

  it("não acessa tarefa de outra organização nem armazena o arquivo", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce(null);

    await expect(
      new TaskAttachmentService(storage, prismaMock as never, auditMock as never).upload({
        user_id: "user-1",
        organization_id: "org-2",
        task_id: "task-1",
        file: {
          buffer: Buffer.from("%PDF-"),
          mimetype: "application/pdf",
          originalname: "evidencia.pdf",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("não revela tarefa a usuário básico que não é responsável", async () => {
    await expect(
      new TaskAttachmentService(storage, prismaMock as never, auditMock as never).upload({
        user_id: "other-user",
        organization_id: "org-1",
        task_id: "task-1",
        integracaoLevel: 0,
        file: {
          buffer: Buffer.from("%PDF-"),
          mimetype: "application/pdf",
          originalname: "evidencia.pdf",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("faz remoção lógica auditada sem limite artificial na listagem", async () => {
    prismaMock.taskAttachment.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      new TaskAttachmentService(storage, prismaMock as never, auditMock as never).remove({
        user_id: "admin-1",
        organization_id: "org-1",
        task_id: "task-1",
        attachment_id: "attachment-1",
        integracaoLevel: 3,
      }),
    ).resolves.toEqual({ id: "attachment-1" });

    expect(prismaMock.taskAttachment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deleted_at: expect.any(Date), deleted_by: "admin-1" }),
      }),
    );
    expect(auditMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Remoção de Anexo de Tarefa", required: true }),
    );

    await new TaskAttachmentService(storage, prismaMock as never, auditMock as never).list({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      integracaoLevel: 0,
    });
    expect(prismaMock.taskAttachment.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ take: expect.anything() }),
    );
  });
});
