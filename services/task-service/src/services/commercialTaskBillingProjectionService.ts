import {
  COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
  type CommercialTaskBillingProjectionResult,
  type CommercialTaskBillingUpdatedEvent,
  error as logError,
  ServiceError,
} from "@workspace/shared";
import {
  INTEGRACAO_TASK_STATUS_WAITING,
  TASK_BILLING_REALIZE,
} from "../constants/integracaoTask.js";
import type { Prisma } from "../generated/prisma/client.js";
import type prismaClient from "../prisma/index.js";

export type CommercialTaskBillingProjectionPrismaDeps = Pick<
  typeof prismaClient,
  "task" | "commercialTaskBillingProjectionEvent" | "$transaction"
>;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function effectFor(
  event: CommercialTaskBillingUpdatedEvent,
  currentStatus: string,
  billing: string,
) {
  if (event.hiring_status === "Contratado") {
    return { status: "Em Andamento", charge_comercial: false, charge_financeiro: true };
  }

  if (event.hiring_status === "Não Contratado") {
    return { status: "Não Contratado", charge_comercial: false, charge_financeiro: false };
  }

  return {
    status: billing === TASK_BILLING_REALIZE ? INTEGRACAO_TASK_STATUS_WAITING : currentStatus,
    charge_comercial: true,
    charge_financeiro: false,
  };
}

export class CommercialTaskBillingProjectionService {
  constructor(private readonly prisma: CommercialTaskBillingProjectionPrismaDeps) {}

  async apply(
    event: CommercialTaskBillingUpdatedEvent,
  ): Promise<CommercialTaskBillingProjectionResult> {
    if (event.event_type !== COMMERCIAL_TASK_BILLING_UPDATED_EVENT) {
      throw new ServiceError(400, "Tipo de evento de cobrança comercial inválido.");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.commercialTaskBillingProjectionEvent.findUnique({
          where: { id: event.event_id },
          select: { organization_id: true, task_id: true },
        });
        if (existing) {
          if (
            existing.organization_id !== event.organization_id ||
            existing.task_id !== event.task_id
          ) {
            throw new ServiceError(409, "Evento de cobrança comercial pertence a outro tenant.");
          }
          return {
            event_id: event.event_id,
            applied: false,
            duplicate: true,
            task_id: event.task_id,
          };
        }

        const task = await tx.task.findFirst({
          where: { id: event.task_id, organization_id: event.organization_id },
          select: { id: true, status: true, billing: true },
        });
        if (!task) throw new ServiceError(404, "Tarefa não encontrada nesta organização.");

        const effect = effectFor(event, task.status, task.billing);
        const updated = await tx.task.updateMany({
          where: { id: event.task_id, organization_id: event.organization_id },
          data: {
            status: effect.status,
            charge_comercial: effect.charge_comercial,
            charge_financeiro: effect.charge_financeiro,
            hiring_status: event.hiring_status,
            payment: event.payment,
            billing_description: event.billing_description,
          },
        });
        if (updated.count !== 1)
          throw new ServiceError(404, "Tarefa não encontrada nesta organização.");

        await tx.commercialTaskBillingProjectionEvent.create({
          data: {
            id: event.event_id,
            organization_id: event.organization_id,
            task_id: event.task_id,
            event_type: event.event_type,
            audit_correlation_id: event.audit_correlation_id,
          } satisfies Prisma.CommercialTaskBillingProjectionEventCreateInput,
        });

        return {
          event_id: event.event_id,
          applied: true,
          duplicate: false,
          task_id: event.task_id,
        };
      });
    } catch (error: unknown) {
      if (error instanceof ServiceError) throw error;
      if (isUniqueConstraintError(error)) {
        const existing = await this.prisma.commercialTaskBillingProjectionEvent.findUnique({
          where: { id: event.event_id },
          select: { organization_id: true, task_id: true },
        });
        if (
          existing?.organization_id === event.organization_id &&
          existing.task_id === event.task_id
        ) {
          return {
            event_id: event.event_id,
            applied: false,
            duplicate: true,
            task_id: event.task_id,
          };
        }
      }
      logError("Erro ao projetar cobrança comercial na tarefa", { error });
      throw new ServiceError(
        500,
        "Não foi possível aplicar a cobrança comercial na tarefa.",
        error,
      );
    }
  }
}
