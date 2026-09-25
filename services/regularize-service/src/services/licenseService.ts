import { error as logError, warn as logWarn, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLicenseBody, UpdateLicenseBody } from "../schemas/license.schemas.js";
import { buildLicenseStatusFilter } from "../schemas/status.schemas.js";
import {
  isLicenseProtocolObjectPath,
  LICENSE_PROTOCOL_SIGNED_URL_EXPIRES_IN_SECONDS,
  type LicenseProtocolStorage,
  type LicenseProtocolUploadFile,
} from "./licenseProtocolStorage.js";
import { RegularizeLogService } from "./regularizeLogService.js";
import type { RegularizeReconciliationService } from "./regularizeReconciliationService.js";
import { ensureRegularizeResponsible } from "./regularizeResponsibleService.js";

const licenseSelect = {
  id: true,
  client_id: true,
  has: true,
  type_license: true,
  entry_date: true,
  protocol: true,
  responsible_id: true,
  status: true,
  date_last_consultation: true,
  current_situation: true,
  contact: true,
  observation: true,
  urgency: true,
  type: true,
  due_date: true,
  task_id: true,
  protocol_file_path: true,
  protocol_file_original_name: true,
  protocol_file_mime_type: true,
  protocol_file_size_bytes: true,
  protocol_file_uploaded_at: true,
} as const;

function toPublicLicense(record: Record<string, unknown>): Record<string, unknown> {
  const {
    protocol_file_path: protocolFilePath,
    protocol_file_original_name: originalName,
    protocol_file_mime_type: mimeType,
    protocol_file_size_bytes: sizeBytes,
    protocol_file_uploaded_at: uploadedAt,
    ...license
  } = record;

  if (!protocolFilePath) {
    return license;
  }

  return {
    ...license,
    protocol_file: {
      original_name: originalName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      uploaded_at: uploadedAt,
    },
  };
}

export class LicenseService {
  readonly #logs: RegularizeLogService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly reconciliationService: RegularizeReconciliationService,
    private readonly protocolStorage?: LicenseProtocolStorage,
  ) {
    this.#logs = new RegularizeLogService(prisma);
  }

  async create(input: {
    organizationId: string;
    userId: string;
    body: CreateLicenseBody;
  }): Promise<Record<string, unknown>> {
    if (input.body.client_id) {
      await this.ensureClientExists(input.organizationId, input.body.client_id);
    }
    if (input.body.task_id) {
      await this.ensureTaskExists(input.organizationId, input.body.task_id);
    }
    await ensureRegularizeResponsible(this.prisma, input.organizationId, input.body.responsible_id);

    const exists = await this.prisma.license.findFirst({
      where: {
        organization_id: input.organizationId,
        protocol: input.body.protocol,
        client_id: input.body.client_id ?? null,
      },
      select: { id: true },
    });
    if (exists) {
      throw new ServiceError(409, "Alvará com este protocolo já cadastrado.");
    }

    const created = await this.prisma.license.create({
      data: {
        ...input.body,
        observation: input.body.observation ?? null,
        organization_id: input.organizationId,
      },
      select: licenseSelect,
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Cadastro",
      referring: "regularize.license",
      referringId: created.id,
      changes: "{}",
    });

    await this.reconciliationService.handleLicenseChanged(input.organizationId, created.id);

    return toPublicLicense(created as unknown as Record<string, unknown>);
  }

  async update(input: {
    organizationId: string;
    userId: string;
    body: UpdateLicenseBody;
  }): Promise<Record<string, unknown>> {
    const existing = await this.prisma.license.findFirst({
      where: { id: input.body.id, organization_id: input.organizationId },
      select: licenseSelect,
    });
    if (!existing) {
      throw new ServiceError(404, "Alvará não encontrado.");
    }

    if (input.body.client_id) {
      await this.ensureClientExists(input.organizationId, input.body.client_id);
    }
    if (input.body.task_id) {
      await this.ensureTaskExists(input.organizationId, input.body.task_id);
    }
    await ensureRegularizeResponsible(
      this.prisma,
      input.organizationId,
      input.body.responsible_id,
      existing.responsible_id,
    );

    const updated = await this.prisma.license.update({
      where: { id: input.body.id },
      data: {
        ...input.body,
        observation: input.body.observation ?? null,
      },
      select: licenseSelect,
    });

    await this.#logs.logUpdateIfChanged({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Atualizacao",
      referring: "regularize.license",
      referringId: existing.id,
      oldData: toPublicLicense(existing as unknown as Record<string, unknown>),
      updatedData: toPublicLicense(updated as unknown as Record<string, unknown>),
    });

    await this.reconciliationService.handleLicenseChanged(input.organizationId, updated.id);

    return toPublicLicense(updated as unknown as Record<string, unknown>);
  }

  async detail(organizationId: string, id: string): Promise<Record<string, unknown>> {
    const detail = await this.prisma.license.findFirst({
      where: { id, organization_id: organizationId },
      select: {
        ...licenseSelect,
        client: { select: { name: true } },
        responsible: { select: { name: true } },
      },
    });
    if (!detail) {
      throw new ServiceError(404, "Alvará não encontrado.");
    }

    return toPublicLicense(detail as unknown as Record<string, unknown>);
  }

  async replaceProtocol(input: {
    organizationId: string;
    userId: string;
    licenseId: string;
    file: LicenseProtocolUploadFile & {
      mimetype: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
    };
  }): Promise<Record<string, unknown>> {
    const storage = this.requireProtocolStorage();
    const existing = await this.prisma.license.findFirst({
      where: { id: input.licenseId, organization_id: input.organizationId },
      select: { id: true, protocol_file_path: true },
    });
    if (!existing) {
      throw new ServiceError(404, "Alvará não encontrado.");
    }

    const objectPath = await storage.upload({
      organizationId: input.organizationId,
      licenseId: input.licenseId,
      file: input.file,
    });
    if (!isLicenseProtocolObjectPath(objectPath, input.organizationId, input.licenseId)) {
      try {
        await storage.deleteObject(objectPath);
      } catch (cleanupErr: unknown) {
        logWarn("Erro ao limpar protocolo com chave inválida", { err: cleanupErr });
      }
      throw new ServiceError(500, "Storage retornou uma chave de protocolo inválida.");
    }

    const uploadedAt = new Date();
    try {
      await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.license.updateMany({
          where: { id: input.licenseId, organization_id: input.organizationId },
          data: {
            protocol_file_path: objectPath,
            protocol_file_original_name: input.file.originalname,
            protocol_file_mime_type: input.file.mimetype,
            protocol_file_size_bytes: input.file.size,
            protocol_file_uploaded_at: uploadedAt,
            protocol_file_uploaded_by_user_id: input.userId,
          },
        });
        if (updated.count !== 1) {
          throw new ServiceError(404, "Alvará não encontrado.");
        }

        await new RegularizeLogService(transaction).createLog({
          userId: input.userId,
          organizationId: input.organizationId,
          action: existing.protocol_file_path
            ? "Substituição de protocolo"
            : "Cadastro de protocolo",
          referring: "regularize.license",
          referringId: input.licenseId,
          changes: {
            had_previous_protocol: Boolean(existing.protocol_file_path),
            mime_type: input.file.mimetype,
            size_bytes: input.file.size,
          },
        });
      });
    } catch (err: unknown) {
      logError("Erro ao persistir metadados do protocolo de licença", { err });
      try {
        await storage.deleteObject(objectPath);
      } catch (cleanupErr: unknown) {
        logWarn("Erro ao limpar novo protocolo após falha de persistência", { err: cleanupErr });
      }
      throw err;
    }

    if (existing.protocol_file_path && existing.protocol_file_path !== objectPath) {
      try {
        await storage.deleteObject(existing.protocol_file_path);
      } catch (err: unknown) {
        logWarn("Erro ao remover protocolo anterior da licença", { err });
      }
    }

    return {
      original_name: input.file.originalname,
      mime_type: input.file.mimetype,
      size_bytes: input.file.size,
      uploaded_at: uploadedAt,
    };
  }

  async createProtocolAccess(input: {
    organizationId: string;
    licenseId: string;
  }): Promise<{ url: string; expires_in_seconds: number }> {
    const storage = this.requireProtocolStorage();
    const license = await this.prisma.license.findFirst({
      where: { id: input.licenseId, organization_id: input.organizationId },
      select: { protocol_file_path: true },
    });
    if (!license) {
      throw new ServiceError(404, "Alvará não encontrado.");
    }
    if (!license.protocol_file_path) {
      throw new ServiceError(404, "Protocolo da licença não encontrado.");
    }
    if (
      !isLicenseProtocolObjectPath(
        license.protocol_file_path,
        input.organizationId,
        input.licenseId,
      )
    ) {
      throw new ServiceError(500, "Chave armazenada do protocolo é inválida.");
    }

    return {
      url: await storage.createSignedAccessUrl(license.protocol_file_path),
      expires_in_seconds: LICENSE_PROTOCOL_SIGNED_URL_EXPIRES_IN_SECONDS,
    };
  }

  async list(params: {
    organizationId: string;
    status: string;
    page: number;
    limit: number;
    paginationRequested: boolean;
  }): Promise<Record<string, unknown>[] | Record<string, unknown>> {
    const where = {
      organization_id: params.organizationId,
      ...buildLicenseStatusFilter(params.status),
    };
    const findManyArgs = {
      where,
      orderBy: {
        entry_date: "desc",
      },
      ...(params.paginationRequested
        ? { skip: (params.page - 1) * params.limit, take: params.limit }
        : {}),
      select: licenseSelect,
    } as const;

    if (!params.paginationRequested) {
      const list = await this.prisma.license.findMany(findManyArgs);
      return list.map((license) => toPublicLicense(license as unknown as Record<string, unknown>));
    }

    const [list, total] = await Promise.all([
      this.prisma.license.findMany(findManyArgs),
      this.prisma.license.count({ where }),
    ]);

    return {
      data: list.map((license) => toPublicLicense(license as unknown as Record<string, unknown>)),
      total,
      page: params.page,
      limit: params.limit,
      hasMore: params.page * params.limit < total,
    };
  }

  private async ensureClientExists(organizationId: string, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!client) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }
  }

  private requireProtocolStorage(): LicenseProtocolStorage {
    if (!this.protocolStorage) {
      throw new ServiceError(500, "Storage privado de protocolos não configurado.");
    }

    return this.protocolStorage;
  }

  private async ensureTaskExists(organizationId: string, taskId: string): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organization_id: organizationId },
      select: { id: true },
    });
    if (!task) {
      throw new ServiceError(404, "Tarefa não encontrada na organização.");
    }
  }
}
