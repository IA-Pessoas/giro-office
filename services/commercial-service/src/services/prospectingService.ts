import { randomUUID } from "node:crypto";

import {
  COMMERCIAL_PROSPECTING_EVENT_VERSION,
  COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
  type CommercialProspectingProjectionStatus,
  error as logError,
  ServiceError,
} from "@workspace/shared";
import type { Prisma } from "../generated/prisma/client.js";

import * as commercialAudit from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";
import type {
  ProspectingAttachmentMimeType,
  ProspectingAttachmentStorage,
} from "../integrations/prospectingAttachmentStorage.js";
import type {
  ProspectingListQuery,
  ProspectingSolution,
  ProspectingStatus,
  ProspectingUpdateStatus,
} from "../schemas/prospecting.schemas.js";
import { assertProspectingTransition } from "./prospectingDomain.js";

const CLIENT_SELECT = { id: true, name: true, company_name: true, fantasy_name: true } as const;

const PROSPECTING_SELECT = {
  id: true,
  client_id: true,
  status: true,
  status_date: true,
  closed_at: true,
  solution: true,
  reference_month: true,
  service: true,
  description: true,
  participants: true,
  meeting_mode: true,
  branch: true,
  pause_reason: true,
  attachment_name: true,
  attachment_mime_type: true,
  attachment_size_bytes: true,
  client: { select: CLIENT_SELECT },
} as const;

function prospectingListSelect(organization_id: string) {
  return {
    ...PROSPECTING_SELECT,
    client: {
      select: {
        ...CLIENT_SELECT,
        cpf_cnpj: true,
        number: true,
        email: true,
        indication: true,
        partners: {
          where: { organization_id },
          select: { clientPF: { select: { name: true } } },
          orderBy: { entry: "asc" },
        },
      },
    },
  } as const;
}
const DUPLICATE_MESSAGE = "Este cliente já possui uma prospecção nesta organização.";
const PROSPECTING_HISTORY_FIELDS = [
  "status",
  "status_date",
  "closed_at",
  "solution",
  "reference_month",
  "service",
  "description",
  "participants",
  "meeting_mode",
  "branch",
  "pause_reason",
] as const;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function asProjectionStatus(status: string): CommercialProspectingProjectionStatus {
  return status as CommercialProspectingProjectionStatus;
}

function toIsoDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function normalizeHistoryValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function buildTransitionEvent({
  eventId,
  organizationId,
  prospectingId,
  clientId,
  fromStatus,
  toStatus,
  statusDate,
  description,
  suppressNotice = false,
  auditCorrelationId,
}: {
  eventId: string;
  organizationId: string;
  prospectingId: string;
  clientId: string;
  fromStatus: string | null;
  toStatus: string;
  statusDate: Date | null;
  description: string | null;
  suppressNotice?: boolean;
  auditCorrelationId: string;
}) {
  return {
    event_id: eventId,
    event_type: COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
    event_version: COMMERCIAL_PROSPECTING_EVENT_VERSION,
    organization_id: organizationId,
    client_id: clientId,
    prospecting_id: prospectingId,
    from_status: fromStatus ? asProjectionStatus(fromStatus) : null,
    to_status: asProjectionStatus(toStatus),
    status_date: toIsoDate(statusDate),
    description,
    ...(suppressNotice ? { suppress_notice: true } : {}),
    audit_correlation_id: auditCorrelationId,
    occurred_at: new Date().toISOString(),
  };
}

export interface CommercialProspecting {
  id: string;
  client_id: string;
  status: string;
  status_date: Date | null;
  closed_at: Date | null;
  solution: string | null;
  reference_month: string | null;
  service: string | null;
  description: string | null;
  participants: string | null;
  meeting_mode: string | null;
  branch: string | null;
  pause_reason: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  client: CommercialProspectingClient;
}

export interface CommercialProspectingListItem extends Omit<CommercialProspecting, "client"> {
  client: CommercialProspectingListClient;
}

export interface CommercialProspectingPage {
  items: CommercialProspectingListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface CommercialProspectingHistoryEntry {
  id: string;
  field: string;
  old_value: Prisma.JsonValue | null;
  new_value: Prisma.JsonValue | null;
  changed_by: string;
  changed_by_name?: string;
  created_at: Date;
}

export interface CommercialProspectingClient {
  id: string;
  name: string;
  company_name: string | null;
  fantasy_name: string | null;
}

export interface CommercialProspectingListClient extends CommercialProspectingClient {
  cpf_cnpj: string;
  number: string | null;
  email: string | null;
  indication: string | null;
  partners: Array<{ clientPF: { name: string } }>;
}

export interface CreateCommercialProspectingRequest {
  user_id: string;
  organization_id: string;
  client_id: string;
  status: ProspectingStatus;
  status_date: Date;
  solution: ProspectingSolution;
  reference_month: string;
  service?: string | null;
  description?: string | null;
  participants?: string | null;
  meeting_mode?: string | null;
  branch?: string | null;
  pause_reason?: string | null;
  audit_correlation_id?: string;
}

export interface UpdateCommercialProspectingRequest {
  user_id: string;
  organization_id: string;
  prospecting_id: string;
  status?: ProspectingUpdateStatus;
  status_date?: Date | null;
  solution?: ProspectingSolution;
  reference_month?: string;
  service?: string | null;
  description?: string | null;
  participants?: string | null;
  meeting_mode?: string | null;
  branch?: string | null;
  pause_reason?: string | null;
  audit_correlation_id?: string;
}

export interface ArchiveCommercialProspectingRequest {
  user_id: string;
  organization_id: string;
  prospecting_id: string;
  audit_correlation_id?: string;
}

export interface ArchiveCommercialProspectingResult {
  id: string;
  deleted: true;
}

export type CommercialProspectingPrismaDeps = Pick<
  typeof prismaClient,
  | "commercialProspecting"
  | "commercialProspectingHistory"
  | "client"
  | "user"
  | "commercialOutboxEvent"
  | "$transaction"
>;
export interface CommercialProspectingAuditDeps {
  createLog: typeof commercialAudit.createLog;
  logUpdateIfChanged: typeof commercialAudit.logUpdateIfChanged;
}

const defaultAuditDeps: CommercialProspectingAuditDeps = commercialAudit;

export class CommercialProspectingService {
  constructor(
    private readonly prisma: CommercialProspectingPrismaDeps = prismaClient,
    private readonly audit: CommercialProspectingAuditDeps = defaultAuditDeps,
    private readonly attachmentStorage?: ProspectingAttachmentStorage,
  ) {}

  async uploadAttachment(input: {
    user_id: string;
    organization_id: string;
    prospecting_id: string;
    file: { buffer: Buffer; mimetype: ProspectingAttachmentMimeType; originalname: string };
  }): Promise<{ name: string; mime_type: string; size_bytes: number }> {
    if (!this.attachmentStorage) throw new ServiceError(503, "Anexos comerciais indisponíveis.");
    const current = await this.prisma.commercialProspecting.findFirst({
      where: {
        id: input.prospecting_id,
        organization_id: input.organization_id,
        archived_at: null,
      },
      select: { id: true, status: true, attachment_path: true, attachment_name: true },
    });
    if (!current) throw new ServiceError(404, "Prospecção comercial não encontrada.");
    if (current.status !== "Paralisado") {
      throw new ServiceError(400, "O anexo só pode ser atualizado em uma prospecção paralisada.");
    }

    const objectPath = await this.attachmentStorage.upload({
      organizationId: input.organization_id,
      prospectingId: current.id,
      file: input.file,
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.commercialProspecting.updateMany({
          where: {
            id: current.id,
            organization_id: input.organization_id,
            archived_at: null,
            status: "Paralisado",
          },
          data: {
            attachment_path: objectPath,
            attachment_name: input.file.originalname,
            attachment_mime_type: input.file.mimetype,
            attachment_size_bytes: input.file.buffer.byteLength,
          },
        });
        if (updated.count !== 1)
          throw new ServiceError(404, "Prospecção comercial não encontrada.");
        await tx.commercialProspectingHistory.create({
          data: {
            organization_id: input.organization_id,
            prospecting_id: current.id,
            changed_by: input.user_id,
            field: "attachment_name",
            old_value: current.attachment_name ?? undefined,
            new_value: input.file.originalname,
          },
        });
      });
    } catch (err: unknown) {
      logError("Erro ao salvar anexo da prospecção comercial", {
        err,
        prospectingId: current.id,
      });
      try {
        await this.attachmentStorage.remove(objectPath);
      } catch (cleanupError: unknown) {
        logError("Falha ao limpar anexo após erro de atualização", {
          cleanupError,
          prospectingId: current.id,
        });
      }
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível salvar o anexo da prospecção.", err);
    }

    await this.audit.logUpdateIfChanged({
      userId: input.user_id,
      organizationId: input.organization_id,
      action: "Atualização de anexo",
      referring: "commercial.prospecting",
      referringId: current.id,
      oldData: { attachment_name: current.attachment_name },
      updatedData: { attachment_name: input.file.originalname },
    });
    if (current.attachment_path) {
      try {
        await this.attachmentStorage.remove(current.attachment_path);
      } catch (err: unknown) {
        logError("Anexo anterior não pôde ser removido após substituição", {
          err,
          prospectingId: current.id,
        });
      }
    }
    return {
      name: input.file.originalname,
      mime_type: input.file.mimetype,
      size_bytes: input.file.buffer.byteLength,
    };
  }

  async attachmentAccess(
    prospecting_id: string,
    organization_id: string,
  ): Promise<{ name: string; url: string }> {
    if (!this.attachmentStorage) throw new ServiceError(503, "Anexos comerciais indisponíveis.");
    const item = await this.prisma.commercialProspecting.findFirst({
      where: { id: prospecting_id, organization_id, archived_at: null },
      select: { attachment_path: true, attachment_name: true },
    });
    if (!item) throw new ServiceError(404, "Prospecção comercial não encontrada.");
    if (!item.attachment_path || !item.attachment_name) {
      throw new ServiceError(404, "Esta prospecção não possui anexo.");
    }
    return {
      name: item.attachment_name,
      url: await this.attachmentStorage.createSignedAccessUrl(item.attachment_path),
    };
  }

  async list(
    organization_id: string,
    filters: ProspectingListQuery = { page: 1, page_size: 20 },
  ): Promise<CommercialProspectingPage> {
    try {
      const where: Prisma.CommercialProspectingWhereInput = {
        organization_id,
        archived_at: null,
        client: { is: { organization_id } },
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search
          ? {
              OR: [
                { client: { is: { name: { contains: filters.search, mode: "insensitive" } } } },
                {
                  client: {
                    is: { company_name: { contains: filters.search, mode: "insensitive" } },
                  },
                },
                {
                  client: {
                    is: { fantasy_name: { contains: filters.search, mode: "insensitive" } },
                  },
                },
                { client: { is: { cpf_cnpj: { contains: filters.search } } } },
                {
                  client: {
                    is: { responsible: { contains: filters.search, mode: "insensitive" } },
                  },
                },
                { client: { is: { number: { contains: filters.search } } } },
                { client: { is: { email: { contains: filters.search, mode: "insensitive" } } } },
                {
                  client: { is: { indication: { contains: filters.search, mode: "insensitive" } } },
                },
                {
                  client: {
                    is: {
                      partners: {
                        some: {
                          organization_id,
                          clientPF: {
                            is: { name: { contains: filters.search, mode: "insensitive" } },
                          },
                        },
                      },
                    },
                  },
                },
                { branch: { contains: filters.search, mode: "insensitive" } },
                { description: { contains: filters.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        this.prisma.commercialProspecting.findMany({
          where,
          select: prospectingListSelect(organization_id),
          orderBy: [{ status: "asc" }, { updated_at: "desc" }, { id: "asc" }],
          skip: (filters.page - 1) * filters.page_size,
          take: filters.page_size,
        }),
        this.prisma.commercialProspecting.count({ where }),
      ]);
      return {
        items,
        page: filters.page,
        page_size: filters.page_size,
        total,
        total_pages: Math.ceil(total / filters.page_size),
      };
    } catch (err: unknown) {
      logError("Erro ao listar prospecções comerciais", { err });
      throw new ServiceError(500, "Não foi possível listar as prospecções comerciais.", err);
    }
  }

  async history(
    prospecting_id: string,
    organization_id: string,
  ): Promise<CommercialProspectingHistoryEntry[]> {
    try {
      const exists = await this.prisma.commercialProspecting.findFirst({
        where: { id: prospecting_id, organization_id, archived_at: null },
        select: { id: true },
      });
      if (!exists) throw new ServiceError(404, "Prospecção comercial não encontrada.");
      const history = await this.prisma.commercialProspectingHistory.findMany({
        where: { prospecting_id, organization_id },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        select: {
          id: true,
          field: true,
          old_value: true,
          new_value: true,
          changed_by: true,
          created_at: true,
        },
      });
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: [...new Set(history.map((entry) => entry.changed_by))] },
          organization_id,
        },
        select: { id: true, full_name: true, name: true },
      });
      const names = new Map(users.map((user) => [user.id, user.full_name?.trim() || user.name]));
      return history.map((entry) => ({
        ...entry,
        changed_by_name: names.get(entry.changed_by) ?? entry.changed_by,
      }));
    } catch (err: unknown) {
      logError("Erro ao consultar histórico de prospecção comercial", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível consultar o histórico da prospecção.", err);
    }
  }

  async listClients(organization_id: string): Promise<CommercialProspectingClient[]> {
    try {
      return await this.prisma.client.findMany({
        where: {
          organization_id,
          commercialProspectings: { none: { organization_id } },
        },
        select: CLIENT_SELECT,
        orderBy: { name: "asc" },
      });
    } catch (err: unknown) {
      logError("Erro ao listar clientes para prospecção", { err });
      throw new ServiceError(500, "Não foi possível listar os clientes para prospecção.", err);
    }
  }

  async detail(id: string, organization_id: string): Promise<CommercialProspecting> {
    try {
      const item = await this.prisma.commercialProspecting.findFirst({
        where: { id, organization_id, archived_at: null },
        select: PROSPECTING_SELECT,
      });
      if (!item) throw new ServiceError(404, "Prospecção comercial não encontrada.");
      return item;
    } catch (err: unknown) {
      logError("Erro ao buscar prospecção comercial", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível buscar a prospecção comercial.", err);
    }
  }

  async create(data: CreateCommercialProspectingRequest): Promise<CommercialProspecting> {
    try {
      const eventId = randomUUID();
      const auditCorrelationId = data.audit_correlation_id ?? eventId;
      const created = await this.prisma.$transaction(async (tx) => {
        const client = await tx.client.findFirst({
          where: { id: data.client_id, organization_id: data.organization_id },
          select: CLIENT_SELECT,
        });
        if (!client) throw new ServiceError(404, "Cliente não encontrado nesta organização.");

        const duplicate = await tx.commercialProspecting.findFirst({
          where: { client_id: data.client_id, organization_id: data.organization_id },
          select: { id: true },
        });
        if (duplicate) throw new ServiceError(409, DUPLICATE_MESSAGE);

        const created = await tx.commercialProspecting.create({
          data: {
            client_id: data.client_id,
            organization_id: data.organization_id,
            status: data.status,
            status_date: data.status_date,
            closed_at: data.status === "Fechado" ? data.status_date : null,
            solution: data.solution,
            reference_month: data.reference_month,
            service: data.service ?? null,
            description: data.description ?? null,
            participants: data.participants ?? null,
            meeting_mode: data.meeting_mode ?? null,
            branch: data.branch ?? null,
            pause_reason: data.pause_reason ?? null,
          },
          select: PROSPECTING_SELECT,
        });
        const event = buildTransitionEvent({
          eventId,
          organizationId: data.organization_id,
          prospectingId: created.id,
          clientId: created.client_id,
          fromStatus: null,
          toStatus: created.status,
          statusDate: created.status_date,
          description: created.description,
          auditCorrelationId,
        });
        await tx.commercialOutboxEvent.create({
          data: {
            id: eventId,
            organization_id: data.organization_id,
            aggregate_id: created.id,
            event_type: event.event_type,
            event_version: event.event_version,
            payload: event as Prisma.InputJsonValue,
            audit_correlation_id: auditCorrelationId,
          },
        });
        await tx.commercialProspectingHistory.createMany({
          data: PROSPECTING_HISTORY_FIELDS.map((field) => ({
            organization_id: data.organization_id,
            prospecting_id: created.id,
            changed_by: data.user_id,
            field,
            new_value:
              created[field] == null
                ? undefined
                : (normalizeHistoryValue(created[field]) as Prisma.InputJsonValue),
          })),
        });
        return created;
      });
      await this.audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Cadastro",
        referring: "commercial.prospecting",
        referringId: created.id,
        changes: { status: created.status, client_id: created.client_id },
        auditCorrelationId,
      });
      return created;
    } catch (err: unknown) {
      logError("Erro ao cadastrar prospecção comercial", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) throw new ServiceError(409, DUPLICATE_MESSAGE);
      throw new ServiceError(500, "Não foi possível cadastrar a prospecção comercial.", err);
    }
  }

  async update(data: UpdateCommercialProspectingRequest): Promise<CommercialProspecting> {
    try {
      const eventId = randomUUID();
      const auditCorrelationId = data.audit_correlation_id ?? eventId;
      const result = await this.prisma.$transaction(async (tx) => {
        const current = await tx.commercialProspecting.findFirst({
          where: {
            id: data.prospecting_id,
            organization_id: data.organization_id,
            archived_at: null,
          },
          select: PROSPECTING_SELECT,
        });
        if (!current) throw new ServiceError(404, "Prospecção comercial não encontrada.");

        const mergedRequired = {
          solution: data.solution ?? current.solution,
          status_date: data.status_date ?? current.status_date,
          reference_month: data.reference_month ?? current.reference_month,
        };
        if (
          !mergedRequired.solution ||
          !mergedRequired.status_date ||
          !mergedRequired.reference_month
        ) {
          throw new ServiceError(400, "Preencha solução, data da situação e mês de referência.");
        }

        const suppressNotice = data.status === "Fechado SE";
        const nextStatus =
          data.status === "Fechado SE"
            ? "Fechado"
            : (data.status ?? (current.status as ProspectingStatus));
        assertProspectingTransition(current.status, nextStatus);
        const updateData: Record<string, unknown> = {};
        if (data.status !== undefined) {
          updateData.status = nextStatus;
          if (nextStatus === "Fechado" && current.status !== "Fechado") {
            updateData.closed_at = new Date();
          }
        }
        if (data.status_date !== undefined) updateData.status_date = data.status_date;
        if (data.solution !== undefined) updateData.solution = data.solution;
        if (data.reference_month !== undefined) updateData.reference_month = data.reference_month;
        if (data.service !== undefined) updateData.service = data.service;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.participants !== undefined) updateData.participants = data.participants;
        if (data.meeting_mode !== undefined) updateData.meeting_mode = data.meeting_mode;
        if (data.branch !== undefined) updateData.branch = data.branch;
        if (data.pause_reason !== undefined) updateData.pause_reason = data.pause_reason;
        const nextPauseReason =
          data.pause_reason === undefined ? current.pause_reason : data.pause_reason;
        if (nextStatus === "Paralisado" && !nextPauseReason?.trim()) {
          throw new ServiceError(400, "Informe o motivo da paralisação.");
        }

        const updateResult = await tx.commercialProspecting.updateMany({
          where: {
            id: data.prospecting_id,
            organization_id: data.organization_id,
            archived_at: null,
          },
          data: updateData,
        });
        if (updateResult.count !== 1) {
          throw new ServiceError(404, "Prospecção comercial não encontrada.");
        }

        const updated = await tx.commercialProspecting.findFirst({
          where: {
            id: data.prospecting_id,
            organization_id: data.organization_id,
            archived_at: null,
          },
          select: PROSPECTING_SELECT,
        });
        if (!updated) throw new ServiceError(404, "Prospecção comercial não encontrada.");

        const historyRows = PROSPECTING_HISTORY_FIELDS.flatMap((field) => {
          const oldValue = current[field];
          const newValue = updated[field];
          const oldNormalized = normalizeHistoryValue(oldValue);
          const newNormalized = normalizeHistoryValue(newValue);
          return JSON.stringify(oldNormalized) === JSON.stringify(newNormalized)
            ? []
            : [
                {
                  organization_id: data.organization_id,
                  prospecting_id: updated.id,
                  changed_by: data.user_id,
                  field,
                  old_value:
                    oldNormalized === null ? undefined : (oldNormalized as Prisma.InputJsonValue),
                  new_value:
                    newNormalized === null ? undefined : (newNormalized as Prisma.InputJsonValue),
                },
              ];
        });
        if (historyRows.length)
          await tx.commercialProspectingHistory.createMany({ data: historyRows });

        if (data.status !== undefined && current.status !== updated.status) {
          const event = buildTransitionEvent({
            eventId,
            organizationId: data.organization_id,
            prospectingId: updated.id,
            clientId: updated.client_id,
            fromStatus: current.status,
            toStatus: updated.status,
            statusDate: updated.status_date,
            description: updated.description,
            suppressNotice,
            auditCorrelationId,
          });
          await tx.commercialOutboxEvent.create({
            data: {
              id: eventId,
              organization_id: data.organization_id,
              aggregate_id: updated.id,
              event_type: event.event_type,
              event_version: event.event_version,
              payload: event as Prisma.InputJsonValue,
              audit_correlation_id: auditCorrelationId,
            },
          });
        }

        return { current, updated };
      });
      const { current, updated } = result;
      await this.audit.logUpdateIfChanged({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Atualização",
        referring: "commercial.prospecting",
        referringId: data.prospecting_id,
        oldData: current,
        updatedData: updated as unknown as Record<string, unknown>,
        auditCorrelationId,
      });
      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar prospecção comercial", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) throw new ServiceError(409, DUPLICATE_MESSAGE);
      throw new ServiceError(500, "Não foi possível atualizar a prospecção comercial.", err);
    }
  }

  async archive(
    data: ArchiveCommercialProspectingRequest,
  ): Promise<ArchiveCommercialProspectingResult> {
    try {
      const archivedAt = new Date();
      const result = await this.prisma.commercialProspecting.updateMany({
        where: {
          id: data.prospecting_id,
          organization_id: data.organization_id,
          archived_at: null,
        },
        data: { archived_at: archivedAt },
      });

      if (result.count === 1) {
        await this.audit.createLog({
          userId: data.user_id,
          organizationId: data.organization_id,
          action: "Arquivamento",
          referring: "commercial.prospecting",
          referringId: data.prospecting_id,
          changes: { archived_at: archivedAt.toISOString() },
          auditCorrelationId: data.audit_correlation_id,
        });
        return { id: data.prospecting_id, deleted: true };
      }

      const existing = await this.prisma.commercialProspecting.findFirst({
        where: { id: data.prospecting_id, organization_id: data.organization_id },
        select: { id: true, archived_at: true },
      });
      if (!existing) throw new ServiceError(404, "Prospecção comercial não encontrada.");
      if (!existing.archived_at)
        throw new ServiceError(404, "Prospecção comercial não encontrada.");

      await this.audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Arquivamento",
        referring: "commercial.prospecting",
        referringId: existing.id,
        changes: { archived_at: existing.archived_at?.toISOString() ?? null },
        auditCorrelationId: data.audit_correlation_id,
      });

      return { id: existing.id, deleted: true };
    } catch (err: unknown) {
      logError("Erro ao arquivar prospecção comercial", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível arquivar a prospecção comercial.", err);
    }
  }
}
