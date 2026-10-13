import {
  type CommercialProspectingCloseResult,
  type CommercialProspectingTransitionEvent,
  error as logError,
  ServiceError,
} from "@workspace/shared";
import { PROJECT_STATUS_WAITING_COMMERCIAL } from "@workspace/shared/database";
import { INTEGRACAO_TASK_STATUS_IN_PROGRESS } from "../constants/integracaoTask.js";
import type { PrismaClient } from "../generated/prisma/client.js";

const TASK_SELECT = {
  id: true,
  model_id: true,
  name: true,
  status: true,
  observations: true,
  responsible_id: true,
  responsible2_id: true,
  responsible3_id: true,
  taskModel: { select: { department: { select: { name: true } } } },
} as const;
const TASK_CLOSE_EXCLUDED_STATUSES = [
  "Concluída",
  "Em Espera",
  "Não Contratado",
  "Paralisado",
] as const;

type CommercialProspectingClosePrisma = Pick<
  PrismaClient,
  | "task"
  | "project"
  | "client"
  | "process"
  | "license"
  | "tasksIntegrationRegularize"
  | "commercialProspectingCloseEvent"
  | "$transaction"
>;

export class CommercialProspectingCloseService {
  constructor(private readonly prisma: CommercialProspectingClosePrisma) {}

  async apply(
    event: CommercialProspectingTransitionEvent,
  ): Promise<CommercialProspectingCloseResult> {
    if (event.to_status !== "Fechado") {
      throw new ServiceError(400, "O contrato de fechamento exige o status Fechado.");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.commercialProspectingCloseEvent.findUnique({
          where: { event_id: event.event_id },
          select: {
            event_id: true,
            organization_id: true,
            client_id: true,
            competence: true,
          },
        });
        if (existing) {
          if (
            existing.organization_id !== event.organization_id ||
            existing.client_id !== event.client_id
          ) {
            throw new ServiceError(409, "Evento comercial já foi processado para outro cliente.");
          }
          return {
            event_id: existing.event_id,
            client_id: existing.client_id,
            competence: existing.competence,
          };
        }

        const tasks = await tx.task.findMany({
          where: {
            organization_id: event.organization_id,
            client_id: event.client_id,
            status: { notIn: TASK_CLOSE_EXCLUDED_STATUSES },
            billing: { not: "2" },
            taskModel: { unique_charge: false },
          },
          select: TASK_SELECT,
        });
        const taskIds = tasks.map((task) => task.id);
        const competence =
          tasks.find((task) => task.name === "Definição de Competência")?.observations ?? "";

        const recorded = await tx.commercialProspectingCloseEvent.create({
          data: {
            event_id: event.event_id,
            organization_id: event.organization_id,
            client_id: event.client_id,
            competence,
          },
          select: {
            event_id: true,
            organization_id: true,
            client_id: true,
            competence: true,
          },
        });

        if (taskIds.length > 0) {
          await tx.task.updateMany({
            where: {
              id: { in: taskIds },
              organization_id: event.organization_id,
              status: { not: INTEGRACAO_TASK_STATUS_IN_PROGRESS },
            },
            data: { status: INTEGRACAO_TASK_STATUS_IN_PROGRESS },
          });

          const regularizeTaskIds = tasks
            .filter(
              (task) =>
                task.status !== INTEGRACAO_TASK_STATUS_IN_PROGRESS &&
                task.taskModel.department.name.trim().toLowerCase() === "regularize",
            )
            .map((task) => task.id);
          if (regularizeTaskIds.length > 0) {
            const transitioningTaskIds = new Set(regularizeTaskIds);
            const transitioningTasks = tasks.filter((task) => transitioningTaskIds.has(task.id));
            const regularizeTaskModels = [
              ...new Set(transitioningTasks.map((task) => task.model_id)),
            ];
            const links = await tx.tasksIntegrationRegularize.findMany({
              where: {
                organization_id: event.organization_id,
                task_model_id: { in: regularizeTaskModels },
              },
              select: { task_model_id: true, referring: true, referring_type: true },
            });
            if (links.length > 0) {
              const client = await tx.client.findFirst({
                where: {
                  id: event.client_id,
                  organization_id: event.organization_id,
                },
                select: { id: true, cpf_cnpj: true, email: true },
              });
              if (!client) throw new ServiceError(404, "Cliente da prospecção não encontrado.");

              for (const task of transitioningTasks) {
                for (const link of links) {
                  if (link.task_model_id !== task.model_id) continue;
                  if (link.referring_type === "process") {
                    const template = await tx.process.findFirst({
                      where: {
                        id: link.referring,
                        organization_id: event.organization_id,
                      },
                      select: { process_type: true },
                    });
                    if (template) {
                      await tx.process.create({
                        data: {
                          client_pj_id: client.id,
                          cpf_cnpj: client.cpf_cnpj,
                          process_type: template.process_type,
                          description: "",
                          entry_date: new Date(),
                          status: "Pendente",
                          financial_status: "Regular",
                          observation: task.observations,
                          responsible1_id: task.responsible_id,
                          responsible2_id: task.responsible2_id,
                          responsible3_id: task.responsible3_id,
                          urgency: "0",
                          task_id: task.id,
                          organization_id: event.organization_id,
                        },
                      });
                    }
                  } else if (link.referring_type === "license") {
                    const template = await tx.license.findFirst({
                      where: {
                        id: link.referring,
                        organization_id: event.organization_id,
                      },
                      select: { type_license: true, type: true, urgency: true },
                    });
                    if (template) {
                      await tx.license.create({
                        data: {
                          client_id: client.id,
                          has: false,
                          type_license: template.type_license,
                          entry_date: new Date(),
                          protocol: "0",
                          responsible_id: task.responsible_id,
                          status: "Em Andamento",
                          current_situation: "",
                          contact: client.email ?? "",
                          observation: task.observations,
                          urgency: template.urgency,
                          type: template.type,
                          task_id: task.id,
                          organization_id: event.organization_id,
                        },
                      });
                    }
                  }
                }
              }
            }
          }
        }

        await tx.task.updateMany({
          where: {
            organization_id: event.organization_id,
            client_id: event.client_id,
            name: { contains: "Proposta Financeira" },
            status: { not: "Concluída" },
          },
          data: { status: "Concluída" },
        });

        await tx.project.updateMany({
          where: {
            client_id: event.client_id,
            organization_id: event.organization_id,
            status: PROJECT_STATUS_WAITING_COMMERCIAL,
          },
          data: { status: "Em andamento" },
        });

        return {
          event_id: recorded.event_id,
          client_id: recorded.client_id,
          competence: recorded.competence,
        };
      });
    } catch (error: unknown) {
      logError("Erro ao aplicar fechamento comercial nas tarefas", { error });
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(500, "Não foi possível aplicar o fechamento nas tarefas.", error);
    }
  }
}
