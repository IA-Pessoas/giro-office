import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import {
  assertChronologicalPointTimes,
  assertSameOrganizationDay,
  DEFAULT_ORGANIZATION_TIMEZONE,
  normalizeOrganizationDate,
  organizationDateKey,
  organizationDateKeyFromInput,
  organizationDayBounds,
} from "../utils/rhDateUtils.js";
import { PointService } from "./pointService.js";
import {
  isRhPointAdjustmentObjectPath,
  type RhPointAdjustmentAttachmentStorage,
  type RhPointAdjustmentMimeType,
  UnavailableRhPointAdjustmentStorage,
} from "./rhPointAdjustmentStorage.js";
import { assertPointDayIsUnlocked } from "./rhTimeSheetLockService.js";

export const RH_SELF_SERVICE_PERMISSION = 1;
export const RH_MANAGER_PERMISSION = 2;
export const RH_MANAGEMENT_PERMISSION = 3;

export type TimeClockRequestStatus = "Pendente" | "Aprovado" | "Rejeitado";

export interface TimeClockRequestCreateInput {
  user_id: string;
  organization_id: string;
  point_id?: string;
  date?: Date | string;
  clock_in: Date;
  lunch_out: Date;
  lunch_in: Date;
  clock_out: Date;
  justification: string;
  attachment?: string | null;
}

export interface TimeClockRequestApproveInput {
  request_id: string;
  approver_user_id: string;
  organization_id: string;
  obs_approver?: string | null;
  rh_permission?: number;
}

export interface TimeClockRequestRejectInput extends TimeClockRequestApproveInput {}

export interface TimeClockRequestListFilters {
  status?: TimeClockRequestStatus;
  user_id?: string;
}

export interface TimeClockRequestAccess {
  actor_user_id: string;
  rh_permission: number;
}

export interface TimeClockRequestRetroactiveInput {
  target_user_id: string;
  organization_id: string;
  date: Date | string;
  clock_in: Date;
  lunch_out: Date;
  lunch_in: Date;
  clock_out: Date;
  justification: string;
  approver_user_id: string;
}

export interface TimeClockRequestBulkApproveInput {
  request_ids: string[];
  approver_user_id: string;
  organization_id: string;
  obs_approver?: string | null;
  rh_permission?: number;
}

const TIME_CLOCK_REQUEST_SELECT = {
  id: true,
  user_id: true,
  point_id: true,
  clock_in: true,
  lunch_out: true,
  lunch_in: true,
  clock_out: true,
  justification: true,
  attachment: true,
  date: true,
  status: true,
  approver_user_id: true,
  obs_approver: true,
  organization_id: true,
} as const;

export type TimeClockRequestSnapshot = Prisma.TimeClockRequestGetPayload<{
  select: typeof TIME_CLOCK_REQUEST_SELECT;
}>;

type OrganizationTimezoneDb = Pick<Prisma.TransactionClient, "organization">;

function isPrismaUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

function assertValidPointTimes(input: {
  clock_in: Date | null;
  lunch_out: Date | null;
  lunch_in: Date | null;
  clock_out: Date | null;
  timezone: string;
}): asserts input is {
  clock_in: Date;
  lunch_out: Date;
  lunch_in: Date;
  clock_out: Date;
  timezone: string;
} {
  for (const [field, value] of Object.entries(input)) {
    if (field === "timezone") continue;
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new ServiceError(400, `${field} inválido.`);
    }
  }

  const validInput = input as {
    clock_in: Date;
    lunch_out: Date;
    lunch_in: Date;
    clock_out: Date;
    timezone: string;
  };
  assertSameOrganizationDay(validInput, validInput.timezone);
  assertChronologicalPointTimes(validInput);
}

class TimeClockRequestService {
  private readonly db: typeof prismaClient;
  private readonly pointService: PointService;
  private readonly attachmentStorage: RhPointAdjustmentAttachmentStorage;

  constructor(
    db: typeof prismaClient = prismaClient,
    pointService: PointService = new PointService(),
    attachmentStorage: RhPointAdjustmentAttachmentStorage = new UnavailableRhPointAdjustmentStorage(),
  ) {
    this.db = db;
    this.pointService = pointService;
    this.attachmentStorage = attachmentStorage;
  }

  private async organizationTimezone(
    organizationId: string,
    db: OrganizationTimezoneDb = this.db,
  ): Promise<string> {
    const organizationDelegate = db.organization;
    if (!organizationDelegate) return DEFAULT_ORGANIZATION_TIMEZONE;

    const organization = await organizationDelegate.findUnique({
      where: { id: organizationId },
      select: { timezone: true } as never,
    });
    if (!organization) throw new ServiceError(404, "Organização não encontrada.");
    return (
      (organization as { timezone?: string | null }).timezone?.trim() ||
      DEFAULT_ORGANIZATION_TIMEZONE
    );
  }

  private async assertManagementAccess(
    db: typeof prismaClient | Prisma.TransactionClient,
    input: { organizationId: string; targetUserId: string; access?: TimeClockRequestAccess },
  ): Promise<void> {
    if (!input.access) return;

    if (input.access.rh_permission >= RH_MANAGEMENT_PERMISSION) {
      const actor = await db.user.findFirst({
        where: { id: input.access.actor_user_id, organization_id: input.organizationId },
        select: { id: true },
      });
      if (!actor) {
        throw new ServiceError(404, "Aprovador não encontrado nesta organização.");
      }
      return;
    }
    if (input.access.rh_permission < RH_MANAGER_PERMISSION) {
      throw new ServiceError(403, "Permissão insuficiente para decidir ajustes de ponto.");
    }

    const [actor, target] = await Promise.all([
      db.user.findFirst({
        where: { id: input.access.actor_user_id, organization_id: input.organizationId },
        select: { department_id: true },
      }),
      db.user.findFirst({
        where: { id: input.targetUserId, organization_id: input.organizationId },
        select: { department_id: true },
      }),
    ]);

    if (!actor || !target || !actor.department_id || actor.department_id !== target.department_id) {
      throw new ServiceError(404, "Solicitação não encontrada no escopo do gestor.");
    }
  }

  private async withSignedAttachment(
    snapshot: TimeClockRequestSnapshot,
  ): Promise<TimeClockRequestSnapshot> {
    if (!snapshot.attachment) return snapshot;
    if (
      !isRhPointAdjustmentObjectPath(snapshot.attachment, snapshot.organization_id, snapshot.id)
    ) {
      return { ...snapshot, attachment: null };
    }

    return {
      ...snapshot,
      attachment: await this.attachmentStorage.createSignedAccessUrl(snapshot.attachment),
    };
  }

  private async getRequest(
    db: typeof prismaClient | Prisma.TransactionClient,
    requestId: string,
  ): Promise<TimeClockRequestSnapshot> {
    const request = await db.timeClockRequest.findUnique({
      where: { id: requestId },
      select: TIME_CLOCK_REQUEST_SELECT,
    });
    if (!request) throw new ServiceError(404, "Solicitação não encontrada.");
    return request;
  }

  private async assertRequestDayIsEditable(
    db: Prisma.TransactionClient,
    request: TimeClockRequestSnapshot,
    timezone: string,
  ): Promise<void> {
    await assertPointDayIsUnlocked(db, {
      organizationId: request.organization_id,
      userId: request.user_id,
      day: request.date,
      timezone,
    });
  }

  private async approveInTransaction(
    tx: Prisma.TransactionClient,
    input: TimeClockRequestApproveInput,
  ): Promise<TimeClockRequestSnapshot> {
    const request = await this.getRequest(tx, input.request_id);
    if (request.organization_id !== input.organization_id) {
      throw new ServiceError(403, "Solicitação pertence a outra organização.");
    }
    if (request.status !== "Pendente") {
      throw new ServiceError(409, "Solicitação não está pendente de aprovação.");
    }
    if (request.user_id === input.approver_user_id) {
      throw new ServiceError(403, "O solicitante não pode decidir o próprio ajuste.");
    }

    await this.assertManagementAccess(tx, {
      organizationId: input.organization_id,
      targetUserId: request.user_id,
      access:
        input.rh_permission === undefined
          ? undefined
          : { actor_user_id: input.approver_user_id, rh_permission: input.rh_permission },
    });
    const timezone = await this.organizationTimezone(input.organization_id, tx);
    await this.assertRequestDayIsEditable(tx, request, timezone);
    const requestTimes = {
      clock_in: request.clock_in,
      lunch_out: request.lunch_out,
      lunch_in: request.lunch_in,
      clock_out: request.clock_out,
      timezone,
    };
    assertValidPointTimes(requestTimes);

    let point = request.point_id
      ? await tx.point.findUnique({
          where: { id: request.point_id },
          select: {
            id: true,
            user_id: true,
            organization_id: true,
            clock_in: true,
            time_bank_balance: true,
          },
        })
      : null;

    if (request.point_id && !point) {
      throw new ServiceError(404, "Registro de ponto vinculado não encontrado.");
    }
    if (
      point &&
      (point.user_id !== request.user_id || point.organization_id !== input.organization_id)
    ) {
      throw new ServiceError(403, "Registro de ponto pertence a outro escopo.");
    }
    if (
      point?.clock_in &&
      organizationDateKey(point.clock_in, timezone) !== organizationDateKey(request.date, timezone)
    ) {
      throw new ServiceError(409, "Registro de ponto não corresponde ao dia da solicitação.");
    }

    if (!point) {
      point = await tx.point.create({
        data: {
          user_id: request.user_id,
          organization_id: input.organization_id,
          clock_in: requestTimes.clock_in,
          lunch_out: requestTimes.lunch_out,
          lunch_in: requestTimes.lunch_in,
          clock_out: requestTimes.clock_out,
        },
        select: {
          id: true,
          user_id: true,
          organization_id: true,
          clock_in: true,
          time_bank_balance: true,
        },
      });
    } else {
      if (point.time_bank_balance !== null && point.time_bank_balance !== undefined) {
        await tx.pointsConfig.update({
          where: { user_id: point.user_id },
          data: { bank_balance: { decrement: point.time_bank_balance } },
        });
      }

      await tx.point.update({
        where: { id: point.id },
        data: {
          clock_in: requestTimes.clock_in,
          lunch_out: requestTimes.lunch_out,
          lunch_in: requestTimes.lunch_in,
          clock_out: requestTimes.clock_out,
          workload_hours: null,
          time_bank_balance: null,
        },
      });
    }

    const claimed = await tx.timeClockRequest.updateMany({
      where: { id: request.id, organization_id: input.organization_id, status: "Pendente" },
      data: {
        status: "Aprovado",
        point_id: point.id,
        approver_user_id: input.approver_user_id,
        ...(input.obs_approver !== undefined
          ? {
              obs_approver:
                input.obs_approver === null ? null : String(input.obs_approver).trim() || null,
            }
          : {}),
      },
    });
    if (claimed.count !== 1) {
      throw new ServiceError(409, "Solicitação não está mais pendente de aprovação.");
    }

    await this.pointService.calculateDailyHours(point.id, input.organization_id, tx, timezone);
    return this.withSignedAttachment(await this.getRequest(tx, request.id));
  }

  async create(input: TimeClockRequestCreateInput): Promise<TimeClockRequestSnapshot> {
    try {
      const userId = assertNonEmptyString(input.user_id, "user_id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const justification = assertNonEmptyString(input.justification, "justification");
      const timezone = await this.organizationTimezone(organizationId);
      assertValidPointTimes({
        clock_in: input.clock_in,
        lunch_out: input.lunch_out,
        lunch_in: input.lunch_in,
        clock_out: input.clock_out,
        timezone,
      });

      if (input.attachment?.trim()) {
        throw new ServiceError(400, "Comprovante deve ser enviado pelo armazenamento privado.");
      }

      if (input.point_id) {
        const point = await this.db.point.findUnique({
          where: { id: input.point_id },
          select: { id: true, user_id: true, organization_id: true, clock_in: true },
        });
        if (!point) throw new ServiceError(404, "Registro de ponto não encontrado.");
        if (point.user_id !== userId) {
          throw new ServiceError(403, "Só é possível solicitar ajuste para o próprio ponto.");
        }
        if (point.organization_id !== organizationId) {
          throw new ServiceError(403, "Registro de ponto pertence a outra organização.");
        }
        if (
          organizationDateKey(point.clock_in, timezone) !==
          organizationDateKey(input.clock_in, timezone)
        ) {
          throw new ServiceError(400, "point_id deve corresponder ao dia dos horários informados.");
        }
      }

      const date = normalizeOrganizationDate(input.date ?? input.clock_in, timezone);
      if (
        input.date &&
        organizationDateKeyFromInput(input.date, timezone) !==
          organizationDateKey(input.clock_in, timezone)
      ) {
        throw new ServiceError(400, "date deve corresponder ao dia dos horários informados.");
      }
      const pending = await this.db.timeClockRequest.findFirst({
        where: { organization_id: organizationId, user_id: userId, date, status: "Pendente" },
        select: { id: true },
      });
      if (pending) {
        throw new ServiceError(409, "Já existe solicitação pendente para este colaborador e dia.");
      }

      const created = await this.db.timeClockRequest.create({
        data: {
          user_id: userId,
          organization_id: organizationId,
          point_id: input.point_id ?? null,
          date,
          clock_in: input.clock_in,
          lunch_out: input.lunch_out,
          lunch_in: input.lunch_in,
          clock_out: input.clock_out,
          justification,
          attachment: input.attachment?.trim() || undefined,
          status: "Pendente",
        } as never,
        select: TIME_CLOCK_REQUEST_SELECT,
      });
      return this.withSignedAttachment(created);
    } catch (err: unknown) {
      logError("Erro ao criar solicitacao de ajuste de ponto", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueViolation(err)) {
        throw new ServiceError(409, "Já existe solicitação pendente para este colaborador e dia.");
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao criar solicitação de ajuste. ${msg}`, err);
    }
  }

  async approve(input: TimeClockRequestApproveInput): Promise<TimeClockRequestSnapshot> {
    try {
      const requestId = assertNonEmptyString(input.request_id, "request_id");
      const approverUserId = assertNonEmptyString(input.approver_user_id, "approver_user_id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      return await this.db.$transaction((tx) =>
        this.approveInTransaction(tx, {
          ...input,
          request_id: requestId,
          approver_user_id: approverUserId,
          organization_id: organizationId,
        }),
      );
    } catch (err: unknown) {
      logError("Erro ao aprovar solicitacao de ajuste de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao aprovar solicitação. ${msg}`, err);
    }
  }

  async approveBulk(input: TimeClockRequestBulkApproveInput): Promise<TimeClockRequestSnapshot[]> {
    try {
      if (input.request_ids.length === 0) {
        throw new ServiceError(400, "Informe ao menos uma solicitação.");
      }
      const uniqueIds = new Set(input.request_ids);
      if (uniqueIds.size !== input.request_ids.length) {
        throw new ServiceError(400, "O lote não pode conter solicitações repetidas.");
      }
      return await this.db.$transaction(async (tx) => {
        const approved: TimeClockRequestSnapshot[] = [];
        for (const requestId of input.request_ids) {
          approved.push(
            await this.approveInTransaction(tx, {
              request_id: requestId,
              approver_user_id: input.approver_user_id,
              organization_id: input.organization_id,
              obs_approver: input.obs_approver,
              rh_permission: input.rh_permission,
            }),
          );
        }
        return approved;
      });
    } catch (err: unknown) {
      logError("Erro ao aprovar lote de ajustes de ponto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao aprovar lote de ajustes de ponto.", err);
    }
  }

  async reject(input: TimeClockRequestRejectInput): Promise<TimeClockRequestSnapshot> {
    try {
      const requestId = assertNonEmptyString(input.request_id, "request_id");
      const approverUserId = assertNonEmptyString(input.approver_user_id, "approver_user_id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const request = await this.getRequest(this.db, requestId);
      if (request.organization_id !== organizationId) {
        throw new ServiceError(403, "Solicitação pertence a outra organização.");
      }
      if (request.status !== "Pendente") {
        throw new ServiceError(409, "Solicitação não está pendente de rejeição.");
      }
      if (request.user_id === approverUserId) {
        throw new ServiceError(403, "O solicitante não pode decidir o próprio ajuste.");
      }

      await this.assertManagementAccess(this.db, {
        organizationId,
        targetUserId: request.user_id,
        access:
          input.rh_permission === undefined
            ? undefined
            : { actor_user_id: approverUserId, rh_permission: input.rh_permission },
      });

      const updated = await this.db.timeClockRequest.updateMany({
        where: { id: requestId, organization_id: organizationId, status: "Pendente" },
        data: {
          status: "Rejeitado",
          approver_user_id: approverUserId,
          obs_approver:
            input.obs_approver === null || input.obs_approver === undefined
              ? null
              : String(input.obs_approver).trim() || null,
        },
      });
      if (updated.count !== 1) {
        throw new ServiceError(409, "Solicitação não está mais pendente de rejeição.");
      }
      return this.withSignedAttachment(await this.getRequest(this.db, requestId));
    } catch (err: unknown) {
      logError("Erro ao rejeitar solicitacao de ajuste de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao rejeitar solicitação. ${msg}`, err);
    }
  }

  async list(
    organizationId: string,
    filters: TimeClockRequestListFilters,
    access?: TimeClockRequestAccess,
  ): Promise<TimeClockRequestSnapshot[]> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");
      const where: Prisma.TimeClockRequestWhereInput = { organization_id: orgId };
      if (filters.status !== undefined) where.status = filters.status;
      if (filters.user_id !== undefined) where.user_id = filters.user_id;

      if (access) {
        if (access.rh_permission < RH_MANAGER_PERMISSION) {
          where.user_id = access.actor_user_id;
        } else if (access.rh_permission < RH_MANAGEMENT_PERMISSION) {
          const actor = await this.db.user.findFirst({
            where: { id: access.actor_user_id, organization_id: orgId },
            select: { department_id: true },
          });
          if (!actor?.department_id) {
            throw new ServiceError(404, "Departamento do gestor não encontrado.");
          }
          where.user = { organization_id: orgId, department_id: actor.department_id };
        }
      }

      const requests = await this.db.timeClockRequest.findMany({
        where,
        select: TIME_CLOCK_REQUEST_SELECT,
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });
      return Promise.all(requests.map((request) => this.withSignedAttachment(request)));
    } catch (err: unknown) {
      logError("Erro ao listar solicitacoes de ajuste de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar solicitações de ajuste. ${msg}`, err);
    }
  }

  async createRetroactive(
    input: TimeClockRequestRetroactiveInput,
  ): Promise<TimeClockRequestSnapshot> {
    try {
      const targetUserId = assertNonEmptyString(input.target_user_id, "target_user_id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const approverUserId = assertNonEmptyString(input.approver_user_id, "approver_user_id");
      const justification = assertNonEmptyString(input.justification, "justification");
      const timezone = await this.organizationTimezone(organizationId);
      assertValidPointTimes({
        clock_in: input.clock_in,
        lunch_out: input.lunch_out,
        lunch_in: input.lunch_in,
        clock_out: input.clock_out,
        timezone,
      });
      const date = normalizeOrganizationDate(input.date, timezone);
      if (
        organizationDateKeyFromInput(input.date, timezone) !==
        organizationDateKey(input.clock_in, timezone)
      ) {
        throw new ServiceError(400, "date deve corresponder ao dia dos horários informados.");
      }

      return await this.db.$transaction(async (tx) => {
        const approver = await tx.user.findFirst({
          where: { id: approverUserId, organization_id: organizationId },
          select: { id: true },
        });
        if (!approver) {
          throw new ServiceError(404, "Aprovador não encontrado nesta organização.");
        }

        const target = await tx.user.findFirst({
          where: { id: targetUserId, organization_id: organizationId },
          select: { id: true },
        });
        if (!target) throw new ServiceError(404, "Colaborador não encontrado nesta organização.");
        await assertPointDayIsUnlocked(tx, {
          organizationId,
          userId: targetUserId,
          day: date,
          timezone,
        });
        const pending = await tx.timeClockRequest.findFirst({
          where: {
            organization_id: organizationId,
            user_id: targetUserId,
            date,
            status: "Pendente",
          },
          select: { id: true },
        });
        if (pending) throw new ServiceError(409, "Existe solicitação pendente para este dia.");

        const { start: dayStart, end: dayEnd } = organizationDayBounds(date, timezone);
        const existingPoint = await tx.point.findFirst({
          where: {
            user_id: targetUserId,
            organization_id: organizationId,
            clock_in: { gte: dayStart, lte: dayEnd },
          },
          select: {
            id: true,
            user_id: true,
            organization_id: true,
            time_bank_balance: true,
          },
        });
        const point = existingPoint
          ? existingPoint
          : await tx.point.create({
              data: {
                user_id: targetUserId,
                organization_id: organizationId,
                clock_in: input.clock_in,
                lunch_out: input.lunch_out,
                lunch_in: input.lunch_in,
                clock_out: input.clock_out,
              },
              select: {
                id: true,
                user_id: true,
                organization_id: true,
                time_bank_balance: true,
              },
            });
        if (existingPoint) {
          if (
            existingPoint.time_bank_balance !== null &&
            existingPoint.time_bank_balance !== undefined
          ) {
            await tx.pointsConfig.update({
              where: { user_id: existingPoint.user_id },
              data: { bank_balance: { decrement: existingPoint.time_bank_balance } },
            });
          }
          await tx.point.update({
            where: { id: existingPoint.id },
            data: {
              clock_in: input.clock_in,
              lunch_out: input.lunch_out,
              lunch_in: input.lunch_in,
              clock_out: input.clock_out,
              workload_hours: null,
              time_bank_balance: null,
            },
          });
        }
        const createdRequest = await tx.timeClockRequest.create({
          data: {
            user_id: targetUserId,
            organization_id: organizationId,
            point_id: point.id,
            date,
            clock_in: input.clock_in,
            lunch_out: input.lunch_out,
            lunch_in: input.lunch_in,
            clock_out: input.clock_out,
            justification,
            status: "Aprovado",
            approver_user_id: approverUserId,
          },
          select: { id: true },
        });
        await this.pointService.calculateDailyHours(point.id, organizationId, tx, timezone);
        const created = await tx.timeClockRequest.findUniqueOrThrow({
          where: { id: createdRequest.id },
          select: TIME_CLOCK_REQUEST_SELECT,
        });
        return this.withSignedAttachment(created);
      });
    } catch (err: unknown) {
      logError("Erro ao criar entrada retroativa de ponto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao criar entrada retroativa de ponto.", err);
    }
  }

  async uploadAttachment(input: {
    request_id: string;
    organization_id: string;
    actor_user_id: string;
    rh_permission: number;
    file: { buffer: Buffer; mimetype: string };
  }): Promise<TimeClockRequestSnapshot> {
    const request = await this.getRequest(this.db, input.request_id);
    if (request.organization_id !== input.organization_id) {
      throw new ServiceError(403, "Solicitação pertence a outra organização.");
    }
    if (request.status !== "Pendente") {
      throw new ServiceError(409, "Somente solicitações pendentes podem receber comprovante.");
    }
    if (request.user_id !== input.actor_user_id && input.rh_permission < RH_MANAGEMENT_PERMISSION) {
      throw new ServiceError(403, "Somente o solicitante pode anexar o comprovante.");
    }

    const objectPath = await this.attachmentStorage.upload({
      organizationId: input.organization_id,
      requestId: request.id,
      file: {
        buffer: input.file.buffer,
        mimetype: input.file.mimetype as RhPointAdjustmentMimeType,
      },
    });
    if (!isRhPointAdjustmentObjectPath(objectPath, input.organization_id, request.id)) {
      throw new ServiceError(500, "Armazenamento retornou uma chave de comprovante inválida.");
    }

    const updated = await this.db.timeClockRequest.update({
      where: { id: request.id },
      data: { attachment: objectPath },
      select: TIME_CLOCK_REQUEST_SELECT,
    });
    return this.withSignedAttachment(updated);
  }
}

export { TimeClockRequestService };
