import { createHash } from "node:crypto";

import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

const REQUEST_SELECT = {
  id: true,
  organization_id: true,
  client_id: true,
  competence: true,
  requester_id: true,
  responsible_id: true,
  urgency_code: true,
  description: true,
  status: true,
  resolution_note: true,
  resolved_at: true,
  created_at: true,
  updated_at: true,
  requester: { select: { id: true, name: true, full_name: true } },
  responsible: { select: { id: true, name: true, full_name: true } },
} as const;

type RequestRecord = Prisma.TriageUrgentRequestGetPayload<{
  select: typeof REQUEST_SELECT;
}>;

export type TriageUrgentRequestPrisma = Pick<
  PrismaClient,
  "$executeRaw" | "$transaction" | "client" | "user" | "triageUrgentRequest"
>;

export interface TriageUrgentRequestAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
}

export interface CreateTriageUrgentRequestInput {
  client_id: string;
  competence: string;
  urgency_code: string;
  description: string;
  responsible_id: string;
}

export interface UpdateTriageUrgentRequestInput {
  urgency_code?: string;
  description?: string;
  responsible_id?: string;
}

export interface ListTriageUrgentRequestInput {
  clientId?: string;
  competence?: string;
  status?: "OPEN" | "CLOSED";
}

export type TriageUrgentRequestDto = Omit<RequestRecord, "organization_id">;

const URGENCY_CODES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const COMPETENCE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function modulePermission(auth: TriageUrgentRequestAuthContext): number {
  return auth.modules ? (auth.modules.triagem ?? 0) : (auth.permission ?? 0);
}

function requireContext(auth: TriageUrgentRequestAuthContext): void {
  if (!auth.userId || !auth.organizationId) {
    throw new ServiceError(400, "Contexto autenticado incompleto.");
  }
}

function requireViewPermission(auth: TriageUrgentRequestAuthContext): void {
  if (modulePermission(auth) < 1) {
    throw new ServiceError(403, "Permissão insuficiente para consultar a Triagem.");
  }
}

function requireWritePermission(auth: TriageUrgentRequestAuthContext): void {
  if (modulePermission(auth) < 2) {
    throw new ServiceError(403, "Permissão insuficiente para alterar a Triagem.");
  }
}

function validateCompetence(competence: string): void {
  if (!COMPETENCE_PATTERN.test(competence)) {
    throw new ServiceError(400, "Competência deve estar no formato AAAA-MM.");
  }
}

function validateUrgencyCode(urgencyCode: string): void {
  if (!URGENCY_CODES.has(urgencyCode)) {
    throw new ServiceError(400, "Código de urgência inválido.");
  }
}

function validateDescription(description: string): string {
  const normalized = description.trim();
  if (!normalized || normalized.length > 2000) {
    throw new ServiceError(400, "A descrição deve conter entre 1 e 2.000 caracteres.");
  }
  return normalized;
}

function requestKey(input: CreateTriageUrgentRequestInput, requesterId: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.client_id,
        input.competence,
        requesterId,
        input.urgency_code,
        input.description.trim(),
        input.responsible_id,
      ]),
    )
    .digest("hex");
}

function toDto(record: RequestRecord): TriageUrgentRequestDto {
  const { organization_id: _organizationId, ...dto } = record;
  return dto;
}

export class TriageUrgentRequestService {
  constructor(
    private readonly prisma: TriageUrgentRequestPrisma,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(
    input: CreateTriageUrgentRequestInput,
    auth: TriageUrgentRequestAuthContext,
  ): Promise<TriageUrgentRequestDto> {
    requireContext(auth);
    requireWritePermission(auth);
    validateCompetence(input.competence);
    validateUrgencyCode(input.urgency_code);
    const description = validateDescription(input.description);

    try {
      const result = await this.withOrganization(auth, async (transaction) => {
        const requester = await this.ensureUser(
          transaction,
          auth,
          auth.userId,
          "Solicitante não encontrado.",
        );
        const client = await transaction.client.findFirst({
          where: { id: input.client_id, organization_id: auth.organizationId },
          select: { id: true },
        });
        if (!client) {
          throw new ServiceError(404, "Cliente não encontrado na organização ativa.");
        }

        await this.ensureUser(
          transaction,
          auth,
          input.responsible_id,
          "Responsável não encontrado na organização ativa.",
        );

        const dedupeKey = requestKey({ ...input, description }, requester.id);
        const existing = await transaction.triageUrgentRequest.findFirst({
          where: { organization_id: auth.organizationId, dedupe_key: dedupeKey },
          select: REQUEST_SELECT,
        });
        if (existing) return existing;

        return transaction.triageUrgentRequest.create({
          data: {
            organization_id: auth.organizationId,
            client_id: input.client_id,
            competence: input.competence,
            requester_id: requester.id,
            responsible_id: input.responsible_id,
            urgency_code: input.urgency_code,
            description,
            status: "OPEN",
            dedupe_key: dedupeKey,
          },
          select: REQUEST_SELECT,
        });
      });

      return toDto(result);
    } catch (error: unknown) {
      logError("Erro ao criar solicitação urgente da Triagem", { err: error });
      if (error instanceof ServiceError) throw error;
      if (isUniqueViolation(error)) {
        const dedupeKey = requestKey({ ...input, description }, auth.userId);
        const existing = await this.withOrganization(auth, (transaction) =>
          transaction.triageUrgentRequest.findFirst({
            where: { organization_id: auth.organizationId, dedupe_key: dedupeKey },
            select: REQUEST_SELECT,
          }),
        );
        if (existing) return toDto(existing);
      }
      throw new ServiceError(500, "Erro ao criar solicitação urgente da Triagem.", error);
    }
  }

  async list(
    input: ListTriageUrgentRequestInput,
    auth: TriageUrgentRequestAuthContext,
  ): Promise<TriageUrgentRequestDto[]> {
    requireContext(auth);
    requireViewPermission(auth);
    if (!input.clientId || !input.competence) {
      throw new ServiceError(400, "Cliente e competência são obrigatórios.");
    }
    validateCompetence(input.competence);

    const records = await this.withOrganization(auth, (transaction) =>
      transaction.triageUrgentRequest.findMany({
        where: {
          organization_id: auth.organizationId,
          client_id: input.clientId,
          competence: input.competence,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: [{ urgency_code: "desc" }, { created_at: "desc" }],
        select: REQUEST_SELECT,
      }),
    );

    return records.map(toDto);
  }

  async update(
    id: string,
    input: UpdateTriageUrgentRequestInput,
    auth: TriageUrgentRequestAuthContext,
  ): Promise<TriageUrgentRequestDto> {
    requireContext(auth);
    requireWritePermission(auth);
    const data: Record<string, unknown> = {};
    if (input.urgency_code !== undefined) {
      validateUrgencyCode(input.urgency_code);
      data.urgency_code = input.urgency_code;
    }
    if (input.description !== undefined) data.description = validateDescription(input.description);
    if (input.responsible_id !== undefined) {
      const responsibleId = input.responsible_id;
      await this.withOrganization(auth, (transaction) =>
        this.ensureUser(
          transaction,
          auth,
          responsibleId,
          "Responsável não encontrado na organização ativa.",
        ),
      );
      data.responsible_id = responsibleId;
    }
    if (Object.keys(data).length === 0) {
      throw new ServiceError(400, "Informe ao menos um campo para atualizar.");
    }

    const current = await this.findOne(id, auth);
    if (current.status === "CLOSED") {
      throw new ServiceError(409, "Solicitação fechada deve ser reaberta antes da edição.");
    }

    const updated = await this.withOrganization(auth, (transaction) =>
      transaction.triageUrgentRequest.update({ where: { id }, data, select: REQUEST_SELECT }),
    );
    return toDto(updated);
  }

  async close(
    id: string,
    resolutionNote: string,
    auth: TriageUrgentRequestAuthContext,
  ): Promise<TriageUrgentRequestDto> {
    requireContext(auth);
    requireWritePermission(auth);
    const note = validateDescription(resolutionNote);
    const current = await this.findOne(id, auth);
    if (current.status === "CLOSED") return toDto(current);

    const updated = await this.withOrganization(auth, (transaction) =>
      transaction.triageUrgentRequest.update({
        where: { id },
        data: { status: "CLOSED", resolution_note: note, resolved_at: this.clock() },
        select: REQUEST_SELECT,
      }),
    );
    return toDto(updated);
  }

  async reopen(id: string, auth: TriageUrgentRequestAuthContext): Promise<TriageUrgentRequestDto> {
    requireContext(auth);
    requireWritePermission(auth);
    const current = await this.findOne(id, auth);
    if (current.status === "OPEN") return toDto(current);

    const updated = await this.withOrganization(auth, (transaction) =>
      transaction.triageUrgentRequest.update({
        where: { id },
        data: { status: "OPEN", resolution_note: null, resolved_at: null },
        select: REQUEST_SELECT,
      }),
    );
    return toDto(updated);
  }

  private async findOne(id: string, auth: TriageUrgentRequestAuthContext): Promise<RequestRecord> {
    const record = await this.withOrganization(auth, (transaction) =>
      transaction.triageUrgentRequest.findFirst({
        where: { id, organization_id: auth.organizationId },
        select: REQUEST_SELECT,
      }),
    );
    if (!record) throw new ServiceError(404, "Solicitação urgente não encontrada.");
    return record;
  }

  private async ensureUser(
    transaction: TriageUrgentRequestPrisma,
    auth: TriageUrgentRequestAuthContext,
    userId: string,
    message: string,
  ): Promise<{ id: string }> {
    const user = await transaction.user.findFirst({
      where: { id: userId, organization_id: auth.organizationId },
      select: { id: true },
    });
    if (!user) throw new ServiceError(404, message);
    return user;
  }

  private async withOrganization<T>(
    auth: TriageUrgentRequestAuthContext,
    callback: (transaction: TriageUrgentRequestPrisma) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "giro_user_runtime"`;
      await transaction.$executeRaw`SELECT set_config('app.organization_id', ${auth.organizationId}, true)`;
      return callback(transaction as unknown as TriageUrgentRequestPrisma);
    });
  }
}
