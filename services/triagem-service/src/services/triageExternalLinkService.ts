import { ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { TRIAGE_CATALOG_CODE_MAX_LENGTH } from "./triageCatalog.constants.js";
import { snapshotTriageCatalogForCompetence } from "./triageCatalogService.js";

const externalLinkSelect = {
  id: true,
  organization_id: true,
  client_id: true,
  competence: true,
  type: true,
  url: true,
  description: true,
  responsible_id: true,
  archived_at: true,
  created_at: true,
  updated_at: true,
  responsible: { select: { id: true, name: true, status: true } },
} as const;

type ExternalLinkRecord = Prisma.TriageExternalLinkGetPayload<{
  select: typeof externalLinkSelect;
}>;

export type TriageExternalLinkPrisma = Pick<
  PrismaClient,
  | "$executeRaw"
  | "$transaction"
  | "client"
  | "user"
  | "triageCatalogItem"
  | "triageCompetence"
  | "triageCompetenceCatalogSnapshot"
  | "triageExternalLink"
>;

export type ExternalLinkType = string;

export interface TriageExternalLinkAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
}

export interface CreateTriageExternalLinkInput {
  client_id: string;
  competence: string;
  type: ExternalLinkType;
  url: string;
  description?: string | null;
  responsible_id?: string | null;
}

export interface UpdateTriageExternalLinkInput {
  type: ExternalLinkType;
  url: string;
  description?: string | null;
  responsible_id?: string | null;
}

export interface ListTriageExternalLinkInput {
  clientId: string;
  competence: string;
  includeArchived?: boolean;
}

export type TriageExternalLinkDto = Omit<ExternalLinkRecord, "organization_id">;

function requireContext(auth: TriageExternalLinkAuthContext): void {
  if (!auth.userId || !auth.organizationId) {
    throw new ServiceError(400, "Contexto autenticado incompleto.");
  }
}

function modulePermission(auth: TriageExternalLinkAuthContext): number {
  if (auth.modules && Object.keys(auth.modules).includes("triagem")) {
    return auth.modules.triagem ?? 0;
  }

  return auth.permission ?? 0;
}

function requireViewPermission(auth: TriageExternalLinkAuthContext): void {
  if (modulePermission(auth) < 1) {
    throw new ServiceError(403, "Permissão insuficiente para consultar a Triagem.");
  }
}

function requireWritePermission(auth: TriageExternalLinkAuthContext): void {
  if (modulePermission(auth) < 2) {
    throw new ServiceError(403, "Permissão insuficiente para alterar a Triagem.");
  }
}

function assertCompetence(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new ServiceError(400, "Competência deve estar no formato AAAA-MM.");
  }
}

function assertLinkValues(input: Pick<UpdateTriageExternalLinkInput, "type" | "url">): void {
  if (!input.type.trim() || input.type.length > TRIAGE_CATALOG_CODE_MAX_LENGTH) {
    throw new ServiceError(400, "Tipo de link inválido.");
  }

  try {
    const parsedUrl = new URL(input.url);
    if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
      throw new Error("invalid url");
    }
  } catch {
    throw new ServiceError(400, "O link deve usar uma URL HTTPS válida.");
  }
}

function toDto(record: ExternalLinkRecord): TriageExternalLinkDto {
  const { organization_id: _organizationId, ...dto } = record;
  return dto;
}

export class TriageExternalLinkService {
  constructor(private readonly prisma: TriageExternalLinkPrisma) {}

  async create(
    input: CreateTriageExternalLinkInput,
    auth: TriageExternalLinkAuthContext,
  ): Promise<TriageExternalLinkDto> {
    requireContext(auth);
    requireWritePermission(auth);
    assertCompetence(input.competence);
    assertLinkValues(input);

    const created = await this.withOrganization(auth, async (transaction) => {
      await this.assertCatalogItemForCompetence(
        transaction,
        "LINK_TYPE",
        input.type,
        auth.organizationId,
        input.client_id,
        input.competence,
      );
      await this.assertClient(transaction, input.client_id, auth.organizationId);
      await this.assertResponsible(transaction, input.responsible_id, auth.organizationId);

      return transaction.triageExternalLink.create({
        data: {
          organization_id: auth.organizationId,
          client_id: input.client_id,
          competence: input.competence,
          type: input.type,
          url: input.url,
          description: input.description ?? null,
          responsible_id: input.responsible_id ?? null,
        },
        select: externalLinkSelect,
      });
    });

    return toDto(created);
  }

  async list(
    input: ListTriageExternalLinkInput,
    auth: TriageExternalLinkAuthContext,
  ): Promise<TriageExternalLinkDto[]> {
    requireContext(auth);
    requireViewPermission(auth);
    assertCompetence(input.competence);

    const records = await this.withOrganization(auth, (transaction) =>
      transaction.triageExternalLink.findMany({
        where: {
          organization_id: auth.organizationId,
          client_id: input.clientId,
          competence: input.competence,
          ...(input.includeArchived ? {} : { archived_at: null }),
        },
        orderBy: [{ competence: "desc" }, { created_at: "desc" }],
        select: externalLinkSelect,
      }),
    );

    return records.map(toDto);
  }

  async update(
    id: string,
    input: UpdateTriageExternalLinkInput,
    auth: TriageExternalLinkAuthContext,
  ): Promise<TriageExternalLinkDto> {
    requireContext(auth);
    requireWritePermission(auth);
    assertLinkValues(input);

    const updated = await this.withOrganization(auth, async (transaction) => {
      const existing = await transaction.triageExternalLink.findFirst({
        where: { id, organization_id: auth.organizationId },
        select: externalLinkSelect,
      });
      if (!existing) {
        throw new ServiceError(404, "Link externo não encontrado.");
      }

      await this.assertCatalogItemForCompetence(
        transaction,
        "LINK_TYPE",
        input.type,
        auth.organizationId,
        existing.client_id,
        existing.competence,
      );
      await this.assertResponsible(transaction, input.responsible_id, auth.organizationId);

      return transaction.triageExternalLink.update({
        where: { id },
        data: {
          type: input.type,
          url: input.url,
          description: input.description ?? null,
          responsible_id: input.responsible_id ?? null,
        },
        select: externalLinkSelect,
      });
    });

    return toDto(updated);
  }

  async archive(id: string, auth: TriageExternalLinkAuthContext): Promise<TriageExternalLinkDto> {
    requireContext(auth);
    requireWritePermission(auth);

    const archived = await this.withOrganization(auth, async (transaction) => {
      const existing = await transaction.triageExternalLink.findFirst({
        where: { id, organization_id: auth.organizationId },
        select: externalLinkSelect,
      });
      if (!existing) {
        throw new ServiceError(404, "Link externo não encontrado.");
      }
      if (existing.archived_at) {
        return existing;
      }

      return transaction.triageExternalLink.update({
        where: { id },
        data: { archived_at: new Date() },
        select: externalLinkSelect,
      });
    });

    return toDto(archived);
  }

  private async assertClient(
    transaction: TriageExternalLinkPrisma,
    clientId: string,
    organizationId: string,
  ): Promise<void> {
    const client = await transaction.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!client) {
      throw new ServiceError(404, "Cliente não encontrado na organização ativa.");
    }
  }

  private async assertResponsible(
    transaction: TriageExternalLinkPrisma,
    responsibleId: string | null | undefined,
    organizationId: string,
  ): Promise<void> {
    if (!responsibleId) {
      return;
    }

    const responsible = await transaction.user.findFirst({
      where: { id: responsibleId, organization_id: organizationId },
      select: { id: true },
    });
    if (!responsible) {
      throw new ServiceError(404, "Responsável não encontrado na organização ativa.");
    }
  }

  private async assertCatalogItemForCompetence(
    transaction: TriageExternalLinkPrisma,
    kind: "LINK_TYPE",
    code: string,
    organizationId: string,
    clientId: string,
    competence: string,
  ): Promise<void> {
    const competenceRecord = await transaction.triageCompetence.findFirst({
      where: {
        organization_id: organizationId,
        client_id: clientId,
        competence,
      },
      select: { id: true, catalog_snapshot_initialized_at: true },
    });
    if (competenceRecord) {
      if (competenceRecord.catalog_snapshot_initialized_at === null) {
        await snapshotTriageCatalogForCompetence(transaction, organizationId, competenceRecord.id);
      }
      const snapshot = await transaction.triageCompetenceCatalogSnapshot.findFirst({
        where: {
          organization_id: organizationId,
          competence_id: competenceRecord.id,
          kind,
          code,
        },
        select: { id: true },
      });
      if (!snapshot) {
        throw new ServiceError(400, "Tipo de link não está disponível no snapshot da competência.");
      }
      return;
    }

    const catalogItem = await transaction.triageCatalogItem.findFirst({
      where: { organization_id: organizationId, kind, code, archived_at: null },
      select: { id: true },
    });
    if (!catalogItem) {
      throw new ServiceError(400, "Tipo de link não cadastrado ou arquivado no catálogo ativo.");
    }
  }

  private async withOrganization<T>(
    auth: TriageExternalLinkAuthContext,
    callback: (transaction: TriageExternalLinkPrisma) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "giro_user_runtime"`;
      await transaction.$executeRaw`SELECT set_config('app.organization_id', ${auth.organizationId}, true)`;
      return callback(transaction as unknown as TriageExternalLinkPrisma);
    });
  }
}
