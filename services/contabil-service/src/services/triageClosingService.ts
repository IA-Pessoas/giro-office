import { ServiceError } from "@workspace/shared";

import { type LogUpdateParams, logUpdateIfChanged } from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";

export const TRIAGE_CLOSING_STATUSES = [
  "NOT_RECEIVED",
  "RECEIVED",
  "UNDER_REVIEW",
  "CLOSED",
  "REOPENED",
] as const;

export type TriageClosingStatus = (typeof TRIAGE_CLOSING_STATUSES)[number];
export type TriageClosingServicePrisma = typeof prismaClient;

type TriageClosingAudit = {
  logUpdateIfChanged: (params: LogUpdateParams) => Promise<void>;
};

export interface TriageClosingRequest {
  client_id: string;
  competence: string;
}

export interface TriageClosingUpdate extends TriageClosingRequest {
  status: TriageClosingStatus;
}

export interface TriageClosingAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
}

function isClosingStatus(value: unknown): value is TriageClosingStatus {
  return (
    typeof value === "string" && TRIAGE_CLOSING_STATUSES.includes(value as TriageClosingStatus)
  );
}

export class TriageClosingService {
  constructor(
    private readonly prisma: TriageClosingServicePrisma = prismaClient,
    private readonly audit: TriageClosingAudit = { logUpdateIfChanged },
  ) {}

  async get(
    request: TriageClosingRequest,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const closing = await this.prisma.triageClosing.findFirst({
      where: {
        client_id: request.client_id,
        competence: request.competence,
        organization_id: organizationId,
        archived_at: null,
      },
    });

    return (
      closing ?? {
        client_id: request.client_id,
        competence: request.competence,
        status: "NOT_RECEIVED",
        archived_at: null,
      }
    );
  }

  async update(
    request: TriageClosingUpdate,
    auth: TriageClosingAuthContext,
  ): Promise<Record<string, unknown>> {
    if (!isClosingStatus(request.status)) {
      throw new ServiceError(400, "Status de fechamento inválido.");
    }
    this.assertCanEdit(auth);

    const identity = {
      organization_id: auth.organizationId,
      client_id: request.client_id,
      competence: request.competence,
    };
    const existing = await this.prisma.triageClosing.findFirst({
      where: { ...identity, archived_at: null },
    });
    const closing = await this.prisma.triageClosing.upsert({
      where: { organization_id_client_id_competence: identity },
      create: { ...identity, status: request.status },
      update: { status: request.status, archived_at: null },
    });

    await this.audit.logUpdateIfChanged({
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: auth.permission ?? null,
      action: "Atualizar fechamento recebido",
      referring: "triagem.closings",
      referringId: closing.id,
      oldData: existing as Record<string, unknown> | null,
      updatedData: closing as Record<string, unknown>,
    });

    return closing;
  }

  async archive(
    request: TriageClosingRequest,
    auth: TriageClosingAuthContext,
  ): Promise<Record<string, unknown>> {
    this.assertCanEdit(auth);
    const closing = await this.prisma.triageClosing.findFirst({
      where: {
        organization_id: auth.organizationId,
        client_id: request.client_id,
        competence: request.competence,
        archived_at: null,
      },
    });
    if (!closing) {
      throw new ServiceError(404, "Fechamento recebido não encontrado.");
    }

    const archived = await this.prisma.triageClosing.update({
      where: { id: closing.id },
      data: { archived_at: new Date() },
    });
    await this.audit.logUpdateIfChanged({
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: auth.permission ?? null,
      action: "Arquivar fechamento recebido",
      referring: "triagem.closings",
      referringId: archived.id,
      oldData: closing as Record<string, unknown>,
      updatedData: archived as Record<string, unknown>,
    });
    return archived;
  }

  private assertCanEdit(auth: TriageClosingAuthContext): void {
    if (Number(auth.modules?.contabil ?? 0) < 2) {
      throw new ServiceError(403, "Permissão insuficiente para alterar o fechamento.");
    }
  }
}
