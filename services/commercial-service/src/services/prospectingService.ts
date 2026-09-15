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
import type { ProspectingStatus } from "../schemas/prospecting.schemas.js";
import { assertProspectingTransition } from "./prospectingDomain.js";

const PROSPECTING_SELECT = {
  id: true,
  client_id: true,
  status: true,
  status_date: true,
  description: true,
  client: { select: { id: true, name: true, company_name: true, fantasy_name: true } },
} as const;

const CLIENT_SELECT = { id: true, name: true, company_name: true, fantasy_name: true } as const;
const DUPLICATE_MESSAGE = "Este cliente já possui uma prospecção nesta organização.";

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function asProjectionStatus(status: string): CommercialProspectingProjectionStatus {
  return status as CommercialProspectingProjectionStatus;
}

function toIsoDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
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
    audit_correlation_id: auditCorrelationId,
    occurred_at: new Date().toISOString(),
  };
}

export interface CommercialProspecting {
  id: string;
  client_id: string;
  status: string;
  status_date: Date | null;
  description: string | null;
  client: CommercialProspectingClient;
}

export interface CommercialProspectingClient {
  id: string;
  name: string;
  company_name: string | null;
  fantasy_name: string | null;
}

export interface CreateCommercialProspectingRequest {
  user_id: string;
  organization_id: string;
  client_id: string;
  status: ProspectingStatus;
  status_date?: Date | null;
  description?: string | null;
  audit_correlation_id?: string;
}

export interface UpdateCommercialProspectingRequest {
  user_id: string;
  organization_id: string;
  prospecting_id: string;
  status?: ProspectingStatus;
  status_date?: Date | null;
  description?: string | null;
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
  "commercialProspecting" | "client" | "commercialOutboxEvent" | "$transaction"
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
  ) {}

  async list(organization_id: string): Promise<CommercialProspecting[]> {
    try {
      return await this.prisma.commercialProspecting.findMany({
        where: { organization_id, archived_at: null },
        select: PROSPECTING_SELECT,
        orderBy: [{ status: "asc" }, { updated_at: "desc" }],
      });
    } catch (err: unknown) {
      logError("Erro ao listar prospecções comerciais", { err });
      throw new ServiceError(500, "Não foi possível listar as prospecções comerciais.", err);
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
            status_date: data.status_date ?? new Date(),
            description: data.description ?? null,
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

        const nextStatus = data.status ?? (current.status as ProspectingStatus);
        assertProspectingTransition(current.status, nextStatus);
        const updateData: Record<string, unknown> = {};
        if (data.status !== undefined) updateData.status = data.status;
        if (data.status_date !== undefined) updateData.status_date = data.status_date;
        if (data.description !== undefined) updateData.description = data.description;

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

      return { id: existing.id, deleted: true };
    } catch (err: unknown) {
      logError("Erro ao arquivar prospecção comercial", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível arquivar a prospecção comercial.", err);
    }
  }
}
