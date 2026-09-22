import type { SupabaseStorageClient } from "@workspace/runtime";
import { describe, expect, it, vi } from "vitest";

import {
  buildTaskAttachmentObjectPath,
  SupabaseTaskAttachmentStorage,
} from "../services/taskAttachmentStorage.js";

const OBJECT_PATH = "integracao/organizations/org-1/tasks/task-1/attachment-1.pdf";
const pdf = {
  buffer: Buffer.from("%PDF-1.7"),
  mimetype: "application/pdf" as const,
  originalname: "comprovante final.pdf",
};

function storageClient(overrides: Partial<SupabaseStorageClient> = {}): SupabaseStorageClient {
  return {
    getBucket: vi.fn().mockResolvedValue({ public: false }),
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    createSignedUrl: vi.fn().mockResolvedValue("https://storage.example/signed/attachment.pdf"),
    ...overrides,
  };
}

describe("task attachment storage", () => {
  it("persiste caminho privado escopado por organização e tarefa, sem URL pública", async () => {
    const client = storageClient();
    const storage = new SupabaseTaskAttachmentStorage(
      client,
      "task-attachments-private",
      () => "attachment-1",
    );

    await expect(
      storage.upload({ organizationId: "org-1", taskId: "task-1", file: pdf }),
    ).resolves.toBe(OBJECT_PATH);

    expect(
      buildTaskAttachmentObjectPath({
        organizationId: "org-1",
        taskId: "task-1",
        attachmentId: "attachment-1",
        mimetype: "application/pdf",
      }),
    ).toBe(OBJECT_PATH);
    expect(client.upload).toHaveBeenCalledWith(
      "task-attachments-private",
      OBJECT_PATH,
      expect.any(Uint8Array),
      { contentType: "application/pdf", upsert: false },
    );
    expect(client.getBucket).toHaveBeenCalledWith("task-attachments-private");
  });

  it("gera URL assinada de cinco minutos somente para objeto autorizado", async () => {
    const client = storageClient();
    const storage = new SupabaseTaskAttachmentStorage(client, "task-attachments-private");

    await expect(storage.createSignedAccessUrl(OBJECT_PATH)).resolves.toBe(
      "https://storage.example/signed/attachment.pdf",
    );
    expect(client.createSignedUrl).toHaveBeenCalledWith(
      "task-attachments-private",
      OBJECT_PATH,
      300,
    );
  });

  it("recusa upload quando o bucket é público", async () => {
    const client = storageClient({ getBucket: vi.fn().mockResolvedValue({ public: true }) });
    const storage = new SupabaseTaskAttachmentStorage(client, "task-attachments-private");

    await expect(
      storage.upload({ organizationId: "org-1", taskId: "task-1", file: pdf }),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "Anexos indisponíveis no momento. Tente novamente mais tarde.",
    });
    expect(client.upload).not.toHaveBeenCalled();
  });

  it("converte falha do Storage em 500 sem vazar a causa", async () => {
    const client = storageClient({ upload: vi.fn().mockRejectedValue(new Error("HTTP 500")) });
    const storage = new SupabaseTaskAttachmentStorage(client, "b", () => "attachment-1");

    await expect(
      storage.upload({ organizationId: "org-1", taskId: "task-1", file: pdf }),
    ).rejects.toMatchObject({ statusCode: 500, message: "Erro ao armazenar anexo da tarefa." });
  });
});
