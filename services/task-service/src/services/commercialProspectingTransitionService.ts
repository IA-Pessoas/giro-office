import {
  type CommercialProspectingProjectionStatus,
  type CommercialProspectingTransitionEvent,
  error as logError,
  ServiceError,
} from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { TaskAudit } from "../integrations/audit.js";

interface TaskTransitionEffect {
  status: string;
  excludedStatuses: string[];
}

export interface CommercialProspectingTransitionResult {
  event_id: string;
  client_id: string;
  updated_count: number;
  duplicate: boolean;
}

type CommercialProspectingTransitionPrisma = Pick<
  PrismaClient,
  "task" | "commercialProspectingTransitionEvent" | "$transaction"
>;

const COMPLETED = "Concluída";
const NOT_CONTRACTED = "Não Contratado";
const WAITING = "Em Espera";

function getTaskTransitionEffect(
  status: CommercialProspectingProjectionStatus,
  scheduledReset = false,
): TaskTransitionEffect | null {
  if (scheduledReset && status === "Análise/Agendamento") {
    return { status: "A Realizar", excludedStatuses: [COMPLETED, NOT_CONTRACTED] };
  }
  switch (status) {
    case "Paralisado":
      return { status, excludedStatuses: [COMPLETED, NOT_CONTRACTED, WAITING] };
    case "Baixada":
      return { status: "Paralisado", excludedStatuses: [COMPLETED, NOT_CONTRACTED] };
    case "Análise Financeira":
    case "Análise/Agendamento":
    case "Envio de Proposta":
      return { status: "A Realizar", excludedStatuses: [COMPLETED, NOT_CONTRACTED, WAITING] };
    case "Recusado pelo Cliente":
    case "Inativo":
      return { status: NOT_CONTRACTED, excludedStatuses: [COMPLETED, WAITING] };
    case "Fechado":
      return null;
  }
}

export class CommercialProspectingTransitionService {
  constructor(
    private readonly prisma: CommercialProspectingTransitionPrisma,
    private readonly audit: TaskAudit,
  ) {}

  async apply(
    event: CommercialProspectingTransitionEvent,
  ): Promise<CommercialProspectingTransitionResult> {
    const effect = getTaskTransitionEffect(event.to_status, event.scheduled_reset === true);
    if (!effect) {
      throw new ServiceError(400, "Esta transição comercial não altera tarefas por este fluxo.");
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.commercialProspectingTransitionEvent.findUnique({
          where: { event_id: event.event_id },
          select: {
            event_id: true,
            organization_id: true,
            client_id: true,
            prospecting_id: true,
          },
        });
        if (existing) {
          if (
            existing.organization_id !== event.organization_id ||
            existing.client_id !== event.client_id ||
            existing.prospecting_id !== event.prospecting_id
          ) {
            throw new ServiceError(
              409,
              "Evento comercial já foi processado para outra prospecção.",
            );
          }
          return {
            response: {
              event_id: existing.event_id,
              client_id: existing.client_id,
              updated_count: 0,
              duplicate: true,
            },
            changedTasks: [],
          };
        }

        await tx.commercialProspectingTransitionEvent.create({
          data: {
            event_id: event.event_id,
            organization_id: event.organization_id,
            client_id: event.client_id,
            prospecting_id: event.prospecting_id,
            from_status: event.from_status,
            to_status: event.to_status,
            audit_correlation_id: event.audit_correlation_id,
          },
        });

        const where = {
          organization_id: event.organization_id,
          client_id: event.client_id,
          status: { notIn: [...effect.excludedStatuses, effect.status] },
        };
        const changedTasks = await tx.task.findMany({
          where,
          select: { id: true, status: true },
        });
        const updated = await tx.task.updateMany({
          where: {
            organization_id: event.organization_id,
            client_id: event.client_id,
            status: { notIn: effect.excludedStatuses },
          },
          data: { status: effect.status },
        });

        return {
          response: {
            event_id: event.event_id,
            client_id: event.client_id,
            updated_count: updated.count,
            duplicate: false,
          },
          changedTasks,
        };
      });
      await Promise.all(
        result.changedTasks.map((task) =>
          this.audit.logUpdateIfChanged({
            userId: null,
            organizationId: event.organization_id,
            action: "Atualização",
            referring: "integracao.tasks",
            referringId: task.id,
            oldData: { status: task.status },
            updatedData: { status: effect.status },
          }),
        ),
      );
      return result.response;
    } catch (error: unknown) {
      logError("Erro ao aplicar situação comercial nas tarefas", { error });
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(
        500,
        "Não foi possível aplicar a situação comercial nas tarefas.",
        error,
      );
    }
  }
}
