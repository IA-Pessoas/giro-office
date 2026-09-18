import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

const catalogItemSelect = {
  id: true,
  organization_id: true,
  kind: true,
  code: true,
  label: true,
  url: true,
  archived_at: true,
  created_at: true,
  updated_at: true,
} as const;

const snapshotSelect = {
  id: true,
  organization_id: true,
  competence_id: true,
  catalog_item_id: true,
  kind: true,
  code: true,
  label: true,
  url: true,
  created_at: true,
} as const;

type CatalogItemRecord = Prisma.TriageCatalogItemGetPayload<{ select: typeof catalogItemSelect }>;
type SnapshotRecord = Prisma.TriageCompetenceCatalogSnapshotGetPayload<{
  select: typeof snapshotSelect;
}>;

export type TriageCatalogTransaction = Pick<
  PrismaClient,
  "$executeRaw" | "triageCatalogItem" | "triageCompetence" | "triageCompetenceCatalogSnapshot"
>;

export type TriageCatalogPrisma = TriageCatalogTransaction & Pick<PrismaClient, "$transaction">;

export type TriageCatalogKind = "JUSTIFICATION" | "LINK_TYPE" | "DELIVERY_METHOD" | "STATE_SITE";

export interface TriageCatalogAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
}

export interface CreateTriageCatalogInput {
  kind: TriageCatalogKind;
  code: string;
  label: string;
  url?: string;
}

export interface UpdateTriageCatalogInput {
  kind?: TriageCatalogKind;
  code?: string;
  label?: string;
  url?: string | null;
}

export interface ListTriageCatalogInput {
  kind?: TriageCatalogKind;
  includeArchived?: boolean;
}

export type TriageCatalogItemDto = Omit<CatalogItemRecord, "organization_id">;
export type TriageCatalogSnapshotDto = Omit<SnapshotRecord, "organization_id">;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function modulePermission(auth: TriageCatalogAuthContext): number {
  if (auth.modules && Object.keys(auth.modules).includes("triagem")) {
    return auth.modules.triagem ?? 0;
  }

  return auth.permission ?? 0;
}

function requireContext(auth: TriageCatalogAuthContext): void {
  if (!auth.userId || !auth.organizationId) {
    throw new ServiceError(400, "Contexto autenticado incompleto.");
  }
}

function requireViewPermission(auth: TriageCatalogAuthContext): void {
  if (modulePermission(auth) < 1) {
    throw new ServiceError(403, "Permissão insuficiente para consultar a Triagem.");
  }
}

function requireWritePermission(auth: TriageCatalogAuthContext): void {
  if (modulePermission(auth) < 2) {
    throw new ServiceError(403, "Permissão insuficiente para alterar a Triagem.");
  }
}

function toDto(record: CatalogItemRecord): TriageCatalogItemDto {
  const { organization_id: _organizationId, ...dto } = record;
  return dto;
}

function toSnapshotDto(record: SnapshotRecord): TriageCatalogSnapshotDto {
  const { organization_id: _organizationId, ...dto } = record;
  return dto;
}

function assertCatalogValues(input: {
  kind?: TriageCatalogKind;
  code?: string;
  label?: string;
  url?: string | null;
}): void {
  if (
    input.kind &&
    !["JUSTIFICATION", "LINK_TYPE", "DELIVERY_METHOD", "STATE_SITE"].includes(input.kind)
  ) {
    throw new ServiceError(400, "Tipo de catálogo inválido.");
  }
  if (input.code !== undefined && (!input.code.trim() || input.code.length > 100)) {
    throw new ServiceError(400, "Código inválido.");
  }
  if (input.label !== undefined && (!input.label.trim() || input.label.length > 255)) {
    throw new ServiceError(400, "Rótulo inválido.");
  }
  if (input.url !== undefined && input.url !== null) {
    try {
      const url = new URL(input.url);
      if (url.protocol !== "https:" || url.username || url.password || input.url.length > 2048) {
        throw new Error("invalid url");
      }
    } catch {
      throw new ServiceError(400, "A URL deve usar HTTPS.");
    }
  }
}

export class TriageCatalogService {
  constructor(private readonly prisma: TriageCatalogPrisma) {}

  async list(
    input: ListTriageCatalogInput,
    auth: TriageCatalogAuthContext,
  ): Promise<TriageCatalogItemDto[]> {
    requireContext(auth);
    requireViewPermission(auth);

    const records = await this.withOrganization(auth.organizationId, (transaction) =>
      transaction.triageCatalogItem.findMany({
        where: {
          organization_id: auth.organizationId,
          ...(input.kind ? { kind: input.kind } : {}),
          ...(input.includeArchived ? {} : { archived_at: null }),
        },
        orderBy: [{ kind: "asc" }, { label: "asc" }, { code: "asc" }],
        select: catalogItemSelect,
      }),
    );

    return records.map(toDto);
  }

  async create(
    input: CreateTriageCatalogInput,
    auth: TriageCatalogAuthContext,
  ): Promise<TriageCatalogItemDto> {
    requireContext(auth);
    requireWritePermission(auth);
    assertCatalogValues(input);

    try {
      const record = await this.withOrganization(auth.organizationId, (transaction) =>
        transaction.triageCatalogItem.create({
          data: {
            organization_id: auth.organizationId,
            kind: input.kind,
            code: input.code.trim(),
            label: input.label.trim(),
            url: input.url ?? null,
          },
          select: catalogItemSelect,
        }),
      );
      return toDto(record);
    } catch (error: unknown) {
      logError("Erro ao criar item de catálogo da Triagem", { err: error });
      if (isUniqueViolation(error)) {
        throw new ServiceError(409, "Já existe um item com este código no catálogo.", error);
      }
      throw new ServiceError(500, "Erro ao criar item de catálogo da Triagem.", error);
    }
  }

  async update(
    id: string,
    input: UpdateTriageCatalogInput,
    auth: TriageCatalogAuthContext,
  ): Promise<TriageCatalogItemDto> {
    requireContext(auth);
    requireWritePermission(auth);
    assertCatalogValues(input);

    try {
      const record = await this.withOrganization(auth.organizationId, async (transaction) => {
        const existing = await transaction.triageCatalogItem.findFirst({
          where: { id, organization_id: auth.organizationId },
          select: catalogItemSelect,
        });
        if (!existing) {
          throw new ServiceError(404, "Item de catálogo não encontrado.");
        }

        return transaction.triageCatalogItem.update({
          where: { id },
          data: {
            ...(input.kind !== undefined ? { kind: input.kind } : {}),
            ...(input.code !== undefined ? { code: input.code.trim() } : {}),
            ...(input.label !== undefined ? { label: input.label.trim() } : {}),
            ...(input.url !== undefined ? { url: input.url } : {}),
          },
          select: catalogItemSelect,
        });
      });
      return toDto(record);
    } catch (error: unknown) {
      logError("Erro ao atualizar item de catálogo da Triagem", { err: error });
      if (error instanceof ServiceError) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        throw new ServiceError(409, "Já existe um item com este código no catálogo.", error);
      }
      throw new ServiceError(500, "Erro ao atualizar item de catálogo da Triagem.", error);
    }
  }

  async archive(id: string, auth: TriageCatalogAuthContext): Promise<TriageCatalogItemDto> {
    requireContext(auth);
    requireWritePermission(auth);

    const record = await this.withOrganization(auth.organizationId, async (transaction) => {
      const existing = await transaction.triageCatalogItem.findFirst({
        where: { id, organization_id: auth.organizationId },
        select: catalogItemSelect,
      });
      if (!existing) {
        throw new ServiceError(404, "Item de catálogo não encontrado.");
      }
      if (existing.archived_at) {
        return existing;
      }

      return transaction.triageCatalogItem.update({
        where: { id },
        data: { archived_at: new Date() },
        select: catalogItemSelect,
      });
    });

    return toDto(record);
  }

  async snapshotForCompetence(
    organizationId: string,
    competenceId: string,
    transaction?: TriageCatalogTransaction,
  ): Promise<TriageCatalogSnapshotDto[]> {
    if (!organizationId || !competenceId) {
      throw new ServiceError(400, "Contexto da competência incompleto.");
    }

    if (transaction) {
      return this.snapshotForCompetenceInTransaction(transaction, organizationId, competenceId);
    }

    return this.withOrganization(organizationId, (transaction) =>
      this.snapshotForCompetenceInTransaction(transaction, organizationId, competenceId),
    );
  }

  private async snapshotForCompetenceInTransaction(
    transaction: TriageCatalogTransaction,
    organizationId: string,
    competenceId: string,
  ): Promise<TriageCatalogSnapshotDto[]> {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`triage.catalog.snapshot:${competenceId}`}, 0))
    `;
    const competence = await transaction.triageCompetence.findFirst({
      where: { id: competenceId, organization_id: organizationId },
      select: { id: true },
    });
    if (!competence) {
      throw new ServiceError(404, "Competência da Triagem não encontrada.");
    }

    const existingSnapshot = await transaction.triageCompetenceCatalogSnapshot.findFirst({
      where: { organization_id: organizationId, competence_id: competenceId },
      select: { id: true },
    });
    if (existingSnapshot) {
      const snapshots = await transaction.triageCompetenceCatalogSnapshot.findMany({
        where: { organization_id: organizationId, competence_id: competenceId },
        orderBy: [{ kind: "asc" }, { label: "asc" }, { code: "asc" }],
        select: snapshotSelect,
      });
      return snapshots.map(toSnapshotDto);
    }

    const items = await transaction.triageCatalogItem.findMany({
      where: { organization_id: organizationId, archived_at: null },
      orderBy: [{ kind: "asc" }, { label: "asc" }, { code: "asc" }],
      select: catalogItemSelect,
    });
    if (items.length > 0) {
      await transaction.triageCompetenceCatalogSnapshot.createMany({
        data: items.map((item) => ({
          organization_id: organizationId,
          competence_id: competenceId,
          catalog_item_id: item.id,
          kind: item.kind,
          code: item.code,
          label: item.label,
          url: item.url,
        })),
        skipDuplicates: true,
      });
    }

    const snapshots = await transaction.triageCompetenceCatalogSnapshot.findMany({
      where: { organization_id: organizationId, competence_id: competenceId },
      orderBy: [{ kind: "asc" }, { label: "asc" }, { code: "asc" }],
      select: snapshotSelect,
    });
    return snapshots.map(toSnapshotDto);
  }

  private async withOrganization<T>(
    organizationId: string,
    callback: (transaction: TriageCatalogTransaction) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "giro_user_runtime"`;
      await transaction.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      return callback(transaction as unknown as TriageCatalogTransaction);
    });
  }
}
