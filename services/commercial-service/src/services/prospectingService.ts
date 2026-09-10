import { error as logError, ServiceError } from "@workspace/shared";

import * as commercialAudit from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";
import { assertProspectingTransition } from "./prospectingDomain.js";
import type { ProspectingStatus } from "../schemas/prospecting.schemas.js";

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
}

export interface UpdateCommercialProspectingRequest {
  user_id: string;
  organization_id: string;
  prospecting_id: string;
  status?: ProspectingStatus;
  status_date?: Date | null;
  description?: string | null;
}

export type CommercialProspectingPrismaDeps = Pick<
  typeof prismaClient,
  "commercialProspecting" | "client"
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
        where: { organization_id },
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
        where: { id, organization_id },
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
      const client = await this.prisma.client.findFirst({
        where: { id: data.client_id, organization_id: data.organization_id },
        select: CLIENT_SELECT,
      });
      if (!client) throw new ServiceError(404, "Cliente não encontrado nesta organização.");

      const duplicate = await this.prisma.commercialProspecting.findFirst({
        where: { client_id: data.client_id, organization_id: data.organization_id },
        select: { id: true },
      });
      if (duplicate) throw new ServiceError(409, DUPLICATE_MESSAGE);

      const created = await this.prisma.commercialProspecting.create({
        data: {
          client_id: data.client_id,
          organization_id: data.organization_id,
          status: data.status,
          status_date: data.status_date ?? new Date(),
          description: data.description ?? null,
        },
        select: PROSPECTING_SELECT,
      });
      await this.audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Cadastro",
        referring: "commercial.prospecting",
        referringId: created.id,
        changes: { status: created.status, client_id: created.client_id },
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
      const current = await this.prisma.commercialProspecting.findFirst({
        where: { id: data.prospecting_id, organization_id: data.organization_id },
        select: PROSPECTING_SELECT,
      });
      if (!current) throw new ServiceError(404, "Prospecção comercial não encontrada.");

      const nextStatus = data.status ?? (current.status as ProspectingStatus);
      assertProspectingTransition(current.status, nextStatus);
      const updateData: Record<string, unknown> = {};
      if (data.status !== undefined) updateData.status = data.status;
      if (data.status_date !== undefined) updateData.status_date = data.status_date;
      if (data.description !== undefined) updateData.description = data.description;

      const updateResult = await this.prisma.commercialProspecting.updateMany({
        where: { id: data.prospecting_id, organization_id: data.organization_id },
        data: updateData,
      });
      if (updateResult.count !== 1) throw new ServiceError(404, "Prospecção comercial não encontrada.");

      const updated = await this.detail(data.prospecting_id, data.organization_id);
      await this.audit.logUpdateIfChanged({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Atualização",
        referring: "commercial.prospecting",
        referringId: data.prospecting_id,
        oldData: current,
        updatedData: updated as unknown as Record<string, unknown>,
      });
      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar prospecção comercial", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) throw new ServiceError(409, DUPLICATE_MESSAGE);
      throw new ServiceError(500, "Não foi possível atualizar a prospecção comercial.", err);
    }
  }
}
