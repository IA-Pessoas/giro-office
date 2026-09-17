import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";

import { INTEGRACAO_TASK_STATUS_IN_PROGRESS } from "../constants/integracaoTask.js";
import { Prisma } from "../generated/prisma/client.js";
import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";

export type TaskPostponement = {
  id: string;
  previous_prevision_date: Date;
  new_prevision_date: Date;
  justification: string;
  author_id: string;
  created_at: Date;
};

type TaskPostponementAccessInput = {
  user_id: string;
  organization_id: string;
  task_id: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
};

function hasPrismaCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
}

function parseCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ServiceError(400, "Data de previsão inválida.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ServiceError(400, "Data de previsão inválida.");
  }
  return parsed;
}

function utcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export class TaskPostponementService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async create(
    input: TaskPostponementAccessInput & { new_prevision_date: string; justification: string },
  ): Promise<TaskPostponement> {
    const newPrevisionDate = parseCalendarDate(input.new_prevision_date);
    const justification = input.justification.trim();
    if (!justification) throw new ServiceError(400, "Justificativa é obrigatória.");

    try {
      return await prismaClient.$transaction(
        async (tx) => {
          const task = await tx.task.findFirst({
            where: { id: input.task_id, organization_id: input.organization_id },
            select: {
              id: true,
              organization_id: true,
              status: true,
              prevision_date: true,
              responsible_id: true,
              responsible2_id: true,
              responsible3_id: true,
            },
          });
          if (!task) throw new ServiceError(404, "Tarefa não existe.");

          requireIntegracaoRouteAccess("POST", "/task/postponement", {
            userId: input.user_id,
            level: input.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
            organizationId: input.organization_id,
            resourceOrganizationId: task.organization_id,
            responsibleId: task.responsible_id,
            responsible2Id: task.responsible2_id,
            responsible3Id: task.responsible3_id,
            isOwner: input.isOwner === true,
          });

          if (task.status !== INTEGRACAO_TASK_STATUS_IN_PROGRESS || !task.prevision_date) {
            throw new ServiceError(
              409,
              "Somente tarefas vencidas em andamento podem ser prorrogadas.",
            );
          }
          if (utcDay(task.prevision_date) >= utcDay(this.now())) {
            throw new ServiceError(409, "Somente tarefas vencidas podem ser prorrogadas.");
          }
          if (newPrevisionDate <= task.prevision_date) {
            throw new ServiceError(409, "A nova previsão deve ser posterior à previsão atual.");
          }

          const postponement = await tx.taskPostponement.create({
            data: {
              task_id: task.id,
              organization_id: task.organization_id,
              previous_prevision_date: task.prevision_date,
              new_prevision_date: newPrevisionDate,
              justification,
              author_id: input.user_id,
            },
            select: {
              id: true,
              previous_prevision_date: true,
              new_prevision_date: true,
              justification: true,
              author_id: true,
              created_at: true,
            },
          });
          await tx.task.update({
            where: { id: task.id },
            data: { prevision_date: newPrevisionDate },
          });

          const administrators = await tx.permission.findMany({
            where: {
              organization_id: task.organization_id,
              integracao: { gte: INTEGRACAO_PERMISSION_LEVEL.ADMIN },
              user: { status: "Ativo" },
            },
            select: { user_id: true },
          });
          const recipients = new Set(
            [
              task.responsible_id,
              task.responsible2_id,
              task.responsible3_id,
              ...administrators.map(({ user_id }) => user_id),
            ].filter((userId): userId is string => Boolean(userId)),
          );
          if (recipients.size > 0) {
            await tx.pessoalNotification.createMany({
              data: [...recipients].map((user_id) => ({
                user_id,
                organization_id: task.organization_id,
                regarding: "task_postponement",
                regarding_id: postponement.id,
                title: "Tarefa prorrogada",
                message: `A previsão da tarefa foi alterada para ${input.new_prevision_date}.`,
                reference_date: postponement.created_at,
              })),
              skipDuplicates: true,
            });
          }
          await audit.createLog({
            userId: input.user_id,
            organizationId: task.organization_id,
            action: "Prorrogação de Tarefa",
            referring: "integracao.task_postponements",
            referringId: postponement.id,
            changes: {
              task_id: task.id,
              previous_prevision_date: task.prevision_date.toISOString(),
              new_prevision_date: newPrevisionDate.toISOString(),
            },
            required: true,
          });
          return postponement;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err: unknown) {
      logError("Erro ao prorrogar tarefa", { err, taskId: input.task_id });
      if (err instanceof ServiceError) throw err;
      if (hasPrismaCode(err, "P2034")) {
        throw new ServiceError(409, "A tarefa foi alterada simultaneamente. Tente novamente.", err);
      }
      throw new ServiceError(500, "Não foi possível prorrogar a tarefa.", err);
    }
  }

  async list(input: TaskPostponementAccessInput): Promise<TaskPostponement[]> {
    const task = await prismaClient.task.findFirst({
      where: { id: input.task_id, organization_id: input.organization_id },
      select: {
        id: true,
        organization_id: true,
        responsible_id: true,
        responsible2_id: true,
        responsible3_id: true,
      },
    });
    if (!task) throw new ServiceError(404, "Tarefa não existe.");
    requireIntegracaoRouteAccess("GET", "/task/postponement/list", {
      userId: input.user_id,
      level: input.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId: input.organization_id,
      resourceOrganizationId: task.organization_id,
      responsibleId: task.responsible_id,
      responsible2Id: task.responsible2_id,
      responsible3Id: task.responsible3_id,
      isOwner: input.isOwner === true,
    });
    return prismaClient.taskPostponement.findMany({
      where: { task_id: task.id, organization_id: task.organization_id },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        previous_prevision_date: true,
        new_prevision_date: true,
        justification: true,
        author_id: true,
        created_at: true,
      },
    });
  }
}
