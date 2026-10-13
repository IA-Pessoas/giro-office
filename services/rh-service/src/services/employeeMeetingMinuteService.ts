import { ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import type {
  CreateEmployeeMeetingMinuteInput,
  UpdateEmployeeMeetingMinuteInput,
} from "../schemas/employeeMeetingMinute.schemas.js";

const RH_DOSSIER_MANAGER_PERMISSION = 2;

const minuteInclude = {
  revisions: {
    orderBy: { version: "desc" },
    include: { changed_by: { select: { id: true, name: true, full_name: true } } },
  },
} as const;

type MinuteWithRevisions = Prisma.RhEmployeeMeetingMinuteGetPayload<{
  include: typeof minuteInclude;
}>;

export interface EmployeeMeetingMinuteContext {
  actorUserId: string;
  organizationId: string;
  targetUserId?: string;
  rhPermission: number;
}

function organizationScope(organizationId: string): Prisma.UserWhereInput {
  return {
    OR: [
      { organization_id: organizationId },
      { organization_id: null, department: { organization_id: organizationId } },
    ],
  };
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

function normalizedAgenda(agenda: string): string {
  return agenda.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-BR");
}

function serializeMinute(minute: MinuteWithRevisions) {
  return {
    id: minute.id,
    user_id: minute.user_id,
    meeting_date: minute.meeting_date.toISOString().slice(0, 10),
    agenda: minute.agenda,
    participants: minute.participants,
    report: minute.report,
    version: minute.version,
    created_by_id: minute.created_by_id,
    updated_by_id: minute.updated_by_id,
    created_at: minute.created_at.toISOString(),
    updated_at: minute.updated_at.toISOString(),
    revisions: minute.revisions.map((revision) => ({
      id: revision.id,
      version: revision.version,
      action: revision.action,
      meeting_date: revision.meeting_date.toISOString().slice(0, 10),
      agenda: revision.agenda,
      participants: revision.participants,
      report: revision.report,
      changed_by_id: revision.changed_by_id,
      changed_by_name: revision.changed_by.full_name ?? revision.changed_by.name,
      changed_at: revision.changed_at.toISOString(),
    })),
  };
}

class EmployeeMeetingMinuteService {
  constructor(private readonly db: PrismaClient = prismaClient) {}

  private async findUser(userId: string, organizationId: string) {
    return this.db.user.findFirst({
      where: { AND: [{ id: userId }, organizationScope(organizationId)] },
      select: { id: true, department_id: true },
    });
  }

  private async resolveTarget(context: EmployeeMeetingMinuteContext, targetUserId?: string) {
    if (context.rhPermission < RH_DOSSIER_MANAGER_PERMISSION) {
      throw new ServiceError(403, "Permissão insuficiente para consultar atas de RH.");
    }
    const actor = await this.findUser(context.actorUserId, context.organizationId);
    if (!actor) throw new ServiceError(404, "Colaborador não encontrado.");
    const target = await this.findUser(targetUserId ?? context.actorUserId, context.organizationId);
    if (!target) throw new ServiceError(404, "Colaborador não encontrado.");
    if (
      context.rhPermission === RH_DOSSIER_MANAGER_PERMISSION &&
      (!actor.department_id || actor.department_id !== target.department_id)
    ) {
      throw new ServiceError(404, "Colaborador não encontrado.");
    }
    return target;
  }

  async list(context: EmployeeMeetingMinuteContext) {
    const target = await this.resolveTarget(context, context.targetUserId);
    const minutes = await this.db.rhEmployeeMeetingMinute.findMany({
      where: { organization_id: context.organizationId, user_id: target.id },
      orderBy: [{ meeting_date: "desc" }, { agenda: "asc" }],
      include: minuteInclude,
    });
    return minutes.map(serializeMinute);
  }

  async create(context: EmployeeMeetingMinuteContext, input: CreateEmployeeMeetingMinuteInput) {
    const target = await this.resolveTarget(context, input.target_user_id ?? context.targetUserId);
    try {
      const created = await this.db.$transaction(async (tx) => {
        const minute = await tx.rhEmployeeMeetingMinute.create({
          data: {
            organization_id: context.organizationId,
            user_id: target.id,
            meeting_date: input.meeting_date,
            agenda: input.agenda,
            agenda_key: normalizedAgenda(input.agenda),
            participants: input.participants,
            report: input.report,
            version: 1,
            created_by_id: context.actorUserId,
            updated_by_id: context.actorUserId,
          },
        });
        await tx.rhEmployeeMeetingMinuteRevision.create({
          data: {
            organization_id: context.organizationId,
            minute_id: minute.id,
            version: 1,
            action: "Created",
            meeting_date: minute.meeting_date,
            agenda: minute.agenda,
            participants: minute.participants,
            report: minute.report,
            changed_by_id: context.actorUserId,
          },
        });
        return tx.rhEmployeeMeetingMinute.findUnique({
          where: { id: minute.id },
          include: minuteInclude,
        });
      });
      if (!created) throw new ServiceError(500, "Não foi possível carregar a ata criada.");
      return serializeMinute(created);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ServiceError(409, "Já existe uma ata com esta data e pauta para o colaborador.");
      }
      throw err;
    }
  }

  async update(
    context: EmployeeMeetingMinuteContext,
    minuteId: string,
    input: UpdateEmployeeMeetingMinuteInput,
  ) {
    const current = await this.db.rhEmployeeMeetingMinute.findFirst({
      where: { id: minuteId, organization_id: context.organizationId },
    });
    if (!current) throw new ServiceError(404, "Ata de RH não encontrada.");
    await this.resolveTarget(context, current.user_id);

    const meetingDate = input.meeting_date ?? current.meeting_date;
    const agenda = input.agenda ?? current.agenda;
    const participants = input.participants ?? current.participants;
    const version = current.version + 1;
    try {
      const updated = await this.db.$transaction(async (tx) => {
        const result = await tx.rhEmployeeMeetingMinute.updateMany({
          where: {
            id: minuteId,
            organization_id: context.organizationId,
            user_id: current.user_id,
            version: current.version,
          },
          data: {
            meeting_date: meetingDate,
            agenda,
            agenda_key: normalizedAgenda(agenda),
            participants,
            report: input.report,
            version: { increment: 1 },
            updated_by_id: context.actorUserId,
          },
        });
        if (result.count === 0) {
          throw new ServiceError(
            409,
            "A ata foi alterada por outra operação. Recarregue e tente novamente.",
          );
        }
        await tx.rhEmployeeMeetingMinuteRevision.create({
          data: {
            organization_id: context.organizationId,
            minute_id: minuteId,
            version,
            action: "Updated",
            meeting_date: meetingDate,
            agenda,
            participants,
            report: input.report,
            changed_by_id: context.actorUserId,
          },
        });
        return tx.rhEmployeeMeetingMinute.findUnique({
          where: { id: minuteId },
          include: minuteInclude,
        });
      });
      if (!updated) throw new ServiceError(404, "Ata de RH não encontrada.");
      return serializeMinute(updated);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ServiceError(409, "Já existe uma ata com esta data e pauta para o colaborador.");
      }
      throw err;
    }
  }
}

export { EmployeeMeetingMinuteService };
