import {
  type CommercialProspectingCloseResult,
  type CommercialProspectingTransitionEvent,
  error as logError,
  ServiceError,
} from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";

const TASK_SELECT = {
  id: true,
  name: true,
  status: true,
  billing: true,
  observations: true,
} as const;

type CommercialProspectingClosePrisma = Pick<
  PrismaClient,
  "task" | "commercialProspectingCloseEvent" | "$transaction"
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
            status: { in: ["A Realizar", "Em andamento"] },
            charge_comercial: false,
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
              billing: "Realizar",
            },
            data: { status: "A Realizar" },
          });
          await tx.task.updateMany({
            where: {
              id: { in: taskIds },
              organization_id: event.organization_id,
              billing: { not: "Realizar" },
            },
            data: { status: "Em andamento" },
          });
        }

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
