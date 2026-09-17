import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";

import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import type { TaskAttachmentMimeType, TaskAttachmentStorage } from "./taskAttachmentStorage.js";

type AttachmentAccessInput = {
  user_id: string;
  organization_id: string;
  task_id: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
};

export class TaskAttachmentService {
  constructor(private readonly storage: TaskAttachmentStorage) {}

  async upload(
    input: AttachmentAccessInput & {
      file: {
        buffer: Buffer;
        mimetype: TaskAttachmentMimeType;
        originalname: string;
      };
    },
  ) {
    const task = await this.getTaskWithAccess("POST", "/task/attachment", input);
    const objectPath = await this.storage.upload({
      organizationId: task.organization_id,
      taskId: task.id,
      file: input.file,
    });

    try {
      return await prismaClient.$transaction(async (tx) => {
        const attachment = await tx.taskAttachment.create({
          data: {
            task_id: task.id,
            organization_id: task.organization_id,
            uploaded_by: input.user_id,
            original_name: input.file.originalname,
            mime_type: input.file.mimetype,
            size_bytes: input.file.buffer.byteLength,
            object_path: objectPath,
          },
          select: {
            id: true,
            original_name: true,
            mime_type: true,
            size_bytes: true,
            created_at: true,
          },
        });
        await audit.createLog({
          userId: input.user_id,
          organizationId: task.organization_id,
          action: "Anexo de Tarefa",
          referring: "integracao.task_attachments",
          referringId: attachment.id,
          changes: {
            task_id: task.id,
            mime_type: attachment.mime_type,
            size_bytes: attachment.size_bytes,
          },
          required: true,
        });
        return attachment;
      });
    } catch (err: unknown) {
      try {
        await this.storage.remove(objectPath);
      } catch (cleanupError: unknown) {
        logError("Falha ao compensar anexo privado de tarefa", { cleanupError, taskId: task.id });
      }
      logError("Erro ao persistir anexo de tarefa", { err, taskId: task.id });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível salvar o anexo da tarefa.", err);
    }
  }

  async list(input: AttachmentAccessInput) {
    const task = await this.getTaskWithAccess("GET", "/task/attachment/list", input);
    return prismaClient.taskAttachment.findMany({
      where: { task_id: task.id, organization_id: task.organization_id, deleted_at: null },
      orderBy: { created_at: "desc" },
      take: 100,
      select: {
        id: true,
        original_name: true,
        mime_type: true,
        size_bytes: true,
        uploaded_by: true,
        created_at: true,
      },
    });
  }

  async createAccessUrl(input: AttachmentAccessInput & { attachment_id: string }) {
    const task = await this.getTaskWithAccess("GET", "/task/attachment/access", input);
    const attachment = await prismaClient.taskAttachment.findFirst({
      where: {
        id: input.attachment_id,
        task_id: task.id,
        organization_id: task.organization_id,
        deleted_at: null,
      },
      select: { id: true, object_path: true },
    });
    if (!attachment) throw new ServiceError(404, "Anexo não encontrado.");
    return { url: await this.storage.createSignedAccessUrl(attachment.object_path) };
  }

  async remove(input: AttachmentAccessInput & { attachment_id: string }) {
    const task = await this.getTaskWithAccess("DELETE", "/task/attachment", input);
    const result = await prismaClient.$transaction(async (tx) => {
      const updated = await tx.taskAttachment.updateMany({
        where: {
          id: input.attachment_id,
          task_id: task.id,
          organization_id: task.organization_id,
          deleted_at: null,
        },
        data: { deleted_at: new Date(), deleted_by: input.user_id },
      });
      if (updated.count === 0) throw new ServiceError(404, "Anexo não encontrado.");
      await audit.createLog({
        userId: input.user_id,
        organizationId: task.organization_id,
        action: "Remoção de Anexo de Tarefa",
        referring: "integracao.task_attachments",
        referringId: input.attachment_id,
        changes: { task_id: task.id },
        required: true,
      });
      return { id: input.attachment_id };
    });
    return result;
  }

  private async getTaskWithAccess(method: string, path: string, input: AttachmentAccessInput) {
    const task = await prismaClient.task.findFirst({
      where: { id: input.task_id, organization_id: input.organization_id },
      select: {
        id: true,
        organization_id: true,
        responsible_id: true,
        responsible2_id: true,
        responsible3_id: true,
      },
    });
    if (!task) throw new ServiceError(404, "Tarefa não existe.");
    requireIntegracaoRouteAccess(method, path, {
      userId: input.user_id,
      level: input.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId: input.organization_id,
      resourceOrganizationId: task.organization_id,
      responsibleId: task.responsible_id,
      responsible2Id: task.responsible2_id,
      responsible3Id: task.responsible3_id,
      isOwner: input.isOwner === true,
    });
    return task;
  }
}
