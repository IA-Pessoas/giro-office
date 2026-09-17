import { error as logError, ServiceError } from "@workspace/shared";

import { Prisma, type PrismaClient } from "../generated/prisma/client.js";

const competenceSelect = {
  id: true,
  organization_id: true,
  client_id: true,
  competence: true,
  configuration_snapshot: true,
  responsible_snapshot: true,
  archived_at: true,
  created_at: true,
  updated_at: true,
} as const;

type CompetenceRecord = Prisma.TriageCompetenceGetPayload<{
  select: typeof competenceSelect;
}>;

export type TriageCompetencePrisma = Pick<
  PrismaClient,
  | "$executeRaw"
  | "$transaction"
  | "client"
  | "triageConfig"
  | "triageResponsible"
  | "triageCompetence"
  | "triageCompetenceHistory"
  | "triageOutboxEvent"
>;

export interface TriageCompetenceAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
}

export interface CreateTriageCompetenceInput {
  client_id: string;
  competence: string;
}

export interface ListTriageCompetenceInput {
  clientId?: string;
  competence?: string;
  includeArchived?: boolean;
}

export type TriageCompetenceDto = Omit<CompetenceRecord, "organization_id">;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function requireContext(auth: TriageCompetenceAuthContext): TriageCompetenceAuthContext {
  if (!auth.userId || !auth.organizationId) {
    throw new ServiceError(400, "Contexto autenticado incompleto.");
  }

  return auth;
}

function modulePermission(auth: TriageCompetenceAuthContext): number {
  if (auth.modules && Object.keys(auth.modules).includes("triagem")) {
    return auth.modules.triagem ?? 0;
  }

  return auth.permission ?? 0;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function requireViewPermission(auth: TriageCompetenceAuthContext): void {
  if (modulePermission(auth) < 1) {
    throw new ServiceError(403, "Permissão insuficiente para consultar a Triagem.");
  }
}

function requireWritePermission(auth: TriageCompetenceAuthContext): void {
  if (modulePermission(auth) < 2) {
    throw new ServiceError(403, "Permissão insuficiente para alterar a Triagem.");
  }
}

function snapshotRecord(record: CompetenceRecord): Record<string, unknown> {
  return {
    id: record.id,
    organization_id: record.organization_id,
    client_id: record.client_id,
    competence: record.competence,
    configuration_snapshot: record.configuration_snapshot,
    responsible_snapshot: record.responsible_snapshot,
    archived_at: record.archived_at?.toISOString() ?? null,
  };
}

function toDto(record: CompetenceRecord): TriageCompetenceDto {
  const { organization_id: _organizationId, ...dto } = record;
  return dto;
}

export class TriageCompetenceService {
  constructor(
    private readonly prisma: TriageCompetencePrisma,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(
    input: CreateTriageCompetenceInput,
    auth: TriageCompetenceAuthContext,
  ): Promise<TriageCompetenceDto> {
    requireContext(auth);
    requireWritePermission(auth);

    try {
      const created = await this.withOrganization(auth, async (transaction) => {
        const existing = await transaction.triageCompetence.findFirst({
          where: {
            organization_id: auth.organizationId,
            client_id: input.client_id,
            competence: input.competence,
          },
          select: competenceSelect,
        });
        if (existing) {
          return existing;
        }

        const client = await transaction.client.findFirst({
          where: { id: input.client_id, organization_id: auth.organizationId },
          select: { id: true },
        });
        if (!client) {
          throw new ServiceError(404, "Cliente não encontrado na organização ativa.");
        }

        const [configs, responsibles] = await Promise.all([
          transaction.triageConfig.findMany({
            where: { organization_id: auth.organizationId, client_id: input.client_id },
            orderBy: [{ type: "asc" }, { updated_at: "desc" }],
            select: { id: true, type: true, active_items: true },
          }),
          transaction.triageResponsible.findMany({
            where: { organization_id: auth.organizationId, client_id: input.client_id },
            orderBy: [{ type: "asc" }, { updated_at: "desc" }],
            select: { id: true, type: true, user_id: true },
          }),
        ]);
        const capturedAt = this.clock().toISOString();
        const configurationSnapshot = {
          version: 1,
          captured_at: capturedAt,
          configs,
        };
        const responsibleSnapshot = {
          version: 1,
          captured_at: capturedAt,
          responsibles,
        };

        const createdRecord = await transaction.triageCompetence.create({
          data: {
            organization_id: auth.organizationId,
            client_id: input.client_id,
            competence: input.competence,
            configuration_snapshot: configurationSnapshot,
            responsible_snapshot: responsibleSnapshot,
          },
          select: competenceSelect,
        });

        await this.recordChange(transaction, {
          competence: createdRecord,
          auth,
          action: "created",
          beforeData: null,
          idempotencyKey: `competence:${createdRecord.id}:created`,
        });

        return createdRecord;
      });

      return toDto(created);
    } catch (error: unknown) {
      logError("Erro ao criar competência da Triagem", { err: error });
      if (error instanceof ServiceError) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        const concurrent = await this.withOrganization(auth, (transaction) =>
          transaction.triageCompetence.findFirst({
            where: {
              organization_id: auth.organizationId,
              client_id: input.client_id,
              competence: input.competence,
            },
            select: competenceSelect,
          }),
        );
        if (concurrent) {
          return toDto(concurrent);
        }
      }
      throw new ServiceError(500, "Erro ao criar competência da Triagem.", error);
    }
  }

  async list(
    input: ListTriageCompetenceInput,
    auth: TriageCompetenceAuthContext,
  ): Promise<TriageCompetenceDto[]> {
    requireContext(auth);
    requireViewPermission(auth);
    const where = {
      organization_id: auth.organizationId,
      ...(input.clientId ? { client_id: input.clientId } : {}),
      ...(input.competence ? { competence: input.competence } : {}),
      ...(input.includeArchived ? {} : { archived_at: null }),
    };
    const records = await this.withOrganization(auth, (transaction) =>
      transaction.triageCompetence.findMany({
        where,
        orderBy: [{ competence: "desc" }, { created_at: "desc" }],
        select: competenceSelect,
      }),
    );

    return records.map(toDto);
  }

  async archive(id: string, auth: TriageCompetenceAuthContext): Promise<TriageCompetenceDto> {
    requireContext(auth);
    requireWritePermission(auth);
    try {
      const archived = await this.withOrganization(auth, async (transaction) => {
        const existing = await transaction.triageCompetence.findFirst({
          where: { id, organization_id: auth.organizationId },
          select: competenceSelect,
        });
        if (!existing) {
          throw new ServiceError(404, "Competência da Triagem não encontrada.");
        }
        if (existing.archived_at) {
          return existing;
        }

        const archivedRecord = await transaction.triageCompetence.update({
          where: { id },
          data: { archived_at: this.clock() },
          select: competenceSelect,
        });
        await this.recordChange(transaction, {
          competence: archivedRecord,
          auth,
          action: "archived",
          beforeData: snapshotRecord(existing),
          idempotencyKey: `competence:${id}:archived`,
        });
        return archivedRecord;
      });
      return toDto(archived);
    } catch (error: unknown) {
      logError("Erro ao arquivar competência da Triagem", { err: error });
      if (error instanceof ServiceError) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        const current = await this.withOrganization(auth, (transaction) =>
          transaction.triageCompetence.findFirst({
            where: { id, organization_id: auth.organizationId },
            select: competenceSelect,
          }),
        );
        if (current?.archived_at) {
          return toDto(current);
        }
      }
      throw new ServiceError(500, "Erro ao arquivar competência da Triagem.", error);
    }
  }

  private async withOrganization<T>(
    auth: TriageCompetenceAuthContext,
    callback: (transaction: TriageCompetencePrisma) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "giro_user_runtime"`;
      await transaction.$executeRaw`SELECT set_config('app.organization_id', ${auth.organizationId}, true)`;
      return callback(transaction as unknown as TriageCompetencePrisma);
    });
  }

  private async recordChange(
    transaction: TriageCompetencePrisma,
    input: {
      competence: CompetenceRecord;
      auth: TriageCompetenceAuthContext;
      action: "created" | "archived";
      beforeData: Record<string, unknown> | null;
      idempotencyKey: string;
    },
  ): Promise<void> {
    const afterData = snapshotRecord(input.competence);
    await transaction.triageCompetenceHistory.create({
      data: {
        competence_id: input.competence.id,
        organization_id: input.auth.organizationId,
        actor_user_id: input.auth.userId,
        action: input.action,
        before_data: input.beforeData ? toJson(input.beforeData) : Prisma.JsonNull,
        after_data: toJson(afterData),
        idempotency_key: input.idempotencyKey,
      },
    });
    await transaction.triageOutboxEvent.create({
      data: {
        event_key: input.idempotencyKey,
        aggregate_type: "triage_competence",
        aggregate_id: input.competence.id,
        competence_id: input.competence.id,
        organization_id: input.auth.organizationId,
        event_type: `triage.competence.${input.action}`,
        payload: toJson({
          actor_user_id: input.auth.userId,
          before: input.beforeData,
          after: afterData,
        }),
      },
    });
  }
}
