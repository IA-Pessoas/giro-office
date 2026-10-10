import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  ConfirmLddImportBody,
  CreateLddBody,
  ListLddQuery,
  PreviewLddImportBody,
  UpdateLddBody,
} from "../schemas/ldd.schemas.js";
import {
  buildLddImportPreview,
  confirmLddImport,
  findLddImportDate,
  type LddImportPreview,
  type LddImportResult,
} from "./lddPdfImportService.js";
import type { PessoalAuditService } from "./pessoalAuditService.js";
import {
  omitUndefined,
  PESSOAL_WRITE_PERMISSION,
  type PessoalAuthContext,
  requireMinimumPermission,
  requireUserId,
} from "./pessoalServiceTypes.js";

const lddSelect = {
  id: true,
  client_id: true,
  type: true,
  period: true,
  due_date: true,
  balance_amount: true,
  registration_status: true,
  status: true,
  organization_id: true,
} as const;

export type LddRecord = {
  id: string;
  client_id: string;
  type: string;
  period: string | null;
  due_date: Date | null;
  balance_amount: number | null;
  registration_status: string | null;
  status: string | null;
  organization_id: string;
};

export class LddService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: PessoalAuditService,
  ) {}

  async create(context: PessoalAuthContext, body: CreateLddBody): Promise<LddRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      await this.ensureClient(context.organizationId, body.client_id);

      const created = await this.prisma.lddPessoal.create({
        data: {
          client_id: body.client_id,
          type: body.type,
          period: body.period ?? null,
          due_date: body.due_date ?? null,
          balance_amount: body.balance_amount ?? null,
          registration_status: body.registration_status ?? null,
          status: body.status ?? null,
          organization_id: context.organizationId,
        },
        select: lddSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Cadastro",
        referring: "pessoal.ldd",
        referringId: created.id,
        changes: {},
        path: `/pessoal/ldd/${created.id}`,
      });

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar LDD de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar LDD de pessoal.", err);
    }
  }

  /** Lê o PDF LDD/INSS e devolve as linhas para revisão; não grava nem audita. */
  async previewImport(
    context: PessoalAuthContext,
    body: PreviewLddImportBody,
  ): Promise<LddImportPreview & { already_imported_at: Date | null }> {
    requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
    await this.ensureClient(context.organizationId, body.client_id);

    const preview = buildLddImportPreview(body);
    const already_imported_at = await findLddImportDate(this.prisma, {
      organizationId: context.organizationId,
      clientId: body.client_id,
      fileHash: preview.file_hash,
    });

    return { ...preview, already_imported_at };
  }

  /** Grava as linhas revisadas; arquivo e saldos entram na mesma transação. */
  async confirmImport(
    context: PessoalAuthContext,
    body: ConfirmLddImportBody,
  ): Promise<LddImportResult> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      await this.ensureClient(context.organizationId, body.client_id);

      const result = await this.prisma.$transaction((tx) => confirmLddImport(tx, context, body));

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Cadastro",
        referring: "pessoal.ldd_import",
        referringId: result.import_id,
        // Só metadados: nome do arquivo e conteúdo do PDF ficam fora da auditoria.
        changes: {
          client_id: body.client_id,
          rows_count: result.rows_count,
          total_amount: result.total_amount,
          ldd_ids: result.records.map((record) => record.id),
        },
        path: "/pessoal/ldd/import",
      });

      return result;
    } catch (err: unknown) {
      logError("Erro ao importar LDD de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao importar LDD de pessoal.", err);
    }
  }

  async list(
    context: Pick<PessoalAuthContext, "organizationId">,
    query: ListLddQuery,
  ): Promise<LddRecord[]> {
    const where = omitUndefined({
      organization_id: context.organizationId,
      client_id: query.client_id,
    });

    return this.prisma.lddPessoal.findMany({
      where,
      select: lddSelect,
      orderBy: { due_date: "asc" },
    });
  }

  async update(context: PessoalAuthContext, id: string, body: UpdateLddBody): Promise<LddRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const existing = await this.prisma.lddPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select: lddSelect,
      });

      if (!existing) {
        throw new ServiceError(404, "LDD não encontrado.");
      }

      const data = omitUndefined({
        type: body.type,
        period: body.period,
        due_date: body.due_date,
        balance_amount: body.balance_amount,
        registration_status: body.registration_status,
        status: body.status,
      });

      const updated = await this.prisma.lddPessoal.update({
        where: { id },
        data,
        select: lddSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Atualizacao",
        referring: "pessoal.ldd",
        referringId: id,
        changes: data,
        path: `/pessoal/ldd/${id}`,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar LDD de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar LDD de pessoal.", err);
    }
  }

  async delete(context: PessoalAuthContext, id: string): Promise<LddRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const existing = await this.prisma.lddPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select: lddSelect,
      });

      if (!existing) {
        throw new ServiceError(404, "LDD não encontrado.");
      }

      await this.prisma.lddPessoal.delete({ where: { id } });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Exclusao",
        referring: "pessoal.ldd",
        referringId: id,
        changes: existing,
        path: `/pessoal/ldd/${id}`,
      });

      return existing;
    } catch (err: unknown) {
      logError("Erro ao remover LDD de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao remover LDD de pessoal.", err);
    }
  }

  private async ensureClient(organizationId: string, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });

    if (!client) {
      throw new ServiceError(404, "Cliente não encontrado para a organização.");
    }
  }
}
