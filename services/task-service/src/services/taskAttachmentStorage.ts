import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { error as logError, ServiceError } from "@workspace/shared";

const EXTENSION_BY_MIME_TYPE = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
} as const;

export type TaskAttachmentMimeType = keyof typeof EXTENSION_BY_MIME_TYPE;
export const TASK_ATTACHMENT_MIME_TYPES = Object.keys(
  EXTENSION_BY_MIME_TYPE,
) as TaskAttachmentMimeType[];

export interface TaskAttachmentStorage {
  upload(input: {
    organizationId: string;
    taskId: string;
    file: { buffer: Buffer; mimetype: TaskAttachmentMimeType; originalname: string };
  }): Promise<string>;
  createSignedAccessUrl(objectPath: string): Promise<string>;
  remove(objectPath: string): Promise<void>;
}

export function buildTaskAttachmentObjectPath(input: {
  organizationId: string;
  taskId: string;
  attachmentId: string;
  mimetype: TaskAttachmentMimeType;
}): string {
  return `integracao/organizations/${input.organizationId}/tasks/${input.taskId}/${input.attachmentId}.${EXTENSION_BY_MIME_TYPE[input.mimetype]}`;
}

export class SupabaseTaskAttachmentStorage implements TaskAttachmentStorage {
  private bucketVerification: Promise<void> | undefined;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket: string,
    private readonly createAttachmentId: () => string = randomUUID,
  ) {}

  async upload(input: {
    organizationId: string;
    taskId: string;
    file: { buffer: Buffer; mimetype: TaskAttachmentMimeType; originalname: string };
  }): Promise<string> {
    await this.ensurePrivateBucket();
    const objectPath = buildTaskAttachmentObjectPath({
      organizationId: input.organizationId,
      taskId: input.taskId,
      attachmentId: this.createAttachmentId(),
      mimetype: input.file.mimetype,
    });

    try {
      const { error } = await this.supabase.storage
        .from(this.bucket)
        .upload(objectPath, input.file.buffer, {
          contentType: input.file.mimetype,
          upsert: false,
        });
      if (error) throw error;
      return objectPath;
    } catch (err: unknown) {
      logError("Erro ao armazenar anexo de tarefa", { err });
      throw new ServiceError(500, "Erro ao armazenar anexo da tarefa.", err);
    }
  }

  async createSignedAccessUrl(objectPath: string): Promise<string> {
    try {
      await this.ensurePrivateBucket();
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(objectPath, 300);
      if (error || !data?.signedUrl) {
        throw new ServiceError(500, "Erro ao gerar link do anexo da tarefa.", error);
      }
      return data.signedUrl;
    } catch (err: unknown) {
      logError("Erro ao gerar link assinado de anexo de tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao gerar link do anexo da tarefa.", err);
    }
  }

  async remove(objectPath: string): Promise<void> {
    try {
      const { error } = await this.supabase.storage.from(this.bucket).remove([objectPath]);
      if (error) throw error;
    } catch (err: unknown) {
      logError("Erro ao remover objeto de anexo de tarefa", { err });
      throw new ServiceError(500, "Erro ao remover objeto do anexo da tarefa.", err);
    }
  }

  private async ensurePrivateBucket(): Promise<void> {
    this.bucketVerification ??= this.verifyPrivateBucket();
    try {
      await this.bucketVerification;
    } catch (err: unknown) {
      this.bucketVerification = undefined;
      throw err;
    }
  }

  private async verifyPrivateBucket(): Promise<void> {
    try {
      const { data, error } = await this.supabase.storage.getBucket(this.bucket);
      if (error || !data || data.public) {
        throw new ServiceError(
          503,
          "Anexos indisponíveis no momento. Tente novamente mais tarde.",
          error,
        );
      }
    } catch (err: unknown) {
      logError("Bucket de anexos de tarefa indisponível ou público", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(
        503,
        "Anexos indisponíveis no momento. Tente novamente mais tarde.",
        err,
      );
    }
  }
}
