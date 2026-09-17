import { describe, expect, it, vi } from "vitest";

import {
  buildTaskAttachmentObjectPath,
  SupabaseTaskAttachmentStorage,
} from "../services/taskAttachmentStorage.js";

describe("task attachment storage", () => {
  it("persiste caminho privado escopado por organização e tarefa, sem URL pública", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn();
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl });
    const storage = new SupabaseTaskAttachmentStorage(
      { storage: { from } } as never,
      "task-attachments-private",
      () => "attachment-1",
    );

    await expect(
      storage.upload({
        organizationId: "org-1",
        taskId: "task-1",
        file: {
          buffer: Buffer.from("%PDF-1.7"),
          mimetype: "application/pdf",
          originalname: "comprovante final.pdf",
        },
      }),
    ).resolves.toBe("integracao/organizations/org-1/tasks/task-1/attachment-1.pdf");

    expect(
      buildTaskAttachmentObjectPath({
        organizationId: "org-1",
        taskId: "task-1",
        attachmentId: "attachment-1",
        mimetype: "application/pdf",
      }),
    ).toBe("integracao/organizations/org-1/tasks/task-1/attachment-1.pdf");
    expect(upload).toHaveBeenCalledWith(
      "integracao/organizations/org-1/tasks/task-1/attachment-1.pdf",
      expect.any(Buffer),
      { contentType: "application/pdf", upsert: false },
    );
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("gera URL assinada de cinco minutos somente para objeto autorizado", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed/attachment.pdf" },
      error: null,
    });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    const storage = new SupabaseTaskAttachmentStorage(
      { storage: { from } } as never,
      "task-attachments-private",
    );

    await expect(
      storage.createSignedAccessUrl("integracao/organizations/org-1/tasks/task-1/attachment-1.pdf"),
    ).resolves.toBe("https://storage.example/signed/attachment.pdf");
    expect(createSignedUrl).toHaveBeenCalledWith(
      "integracao/organizations/org-1/tasks/task-1/attachment-1.pdf",
      300,
    );
  });
});
