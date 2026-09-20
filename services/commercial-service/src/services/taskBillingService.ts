import { randomUUID } from "node:crypto";

import {
  COMMERCIAL_TASK_BILLING_EVENT_VERSION,
  COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
  type CommercialTaskBillingUpdatedEvent,
  type CommercialTaskHiringStatus,
  error as logError,
  ServiceError,
} from "@workspace/shared";
import type { Prisma } from "../generated/prisma/client.js";

import * as audit from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";
import type { UpdateTaskBillingBody } from "../schemas/taskBilling.schemas.js";

const TASK_BILLING_SELECT = {
  id: true,
  task_id: true,
  hiring_status: true,
  payment: true,
  billing_description: true,
  task: { select: { id: true, name: true, status: true, billing: true } },
} as const;

const TASK_SELECT = {
  id: true,
  name: true,
  status: true,
  billing: true,
  commercialTaskBilling: { select: TASK_BILLING_SELECT },
} as const;

export interface CommercialTaskBilling {
  id: string | null;
  task_id: string;
  task_name: string;
  task_status: string;
  billing: string;
  hiring_status: CommercialTaskHiringStatus | null;
  payment: string | null;
  billing_description: string | null;
}

export interface CommercialTaskBillingRequest extends UpdateTaskBillingBody {
  user_id: string;
  organization_id: string;
  task_id: string;
  audit_correlation_id?: string;
}

export type CommercialTaskBillingPrismaDeps = Pick<
  typeof prismaClient,
  "task" | "commercialTaskBilling" | "commercialOutboxEvent" | "$transaction"
>;

export type CommercialTaskBillingAuditDeps = Pick<typeof audit, "logUpdateIfChanged">;

function toTaskBilling(row: {
  id: string;
  name: string;
  status: string;
  billing: string;
  commercialTaskBilling: {
    id: string;
    task_id: string;
    hiring_status: string;
    payment: string | null;
    billing_description: string | null;
  } | null;
}): CommercialTaskBilling {
  return {
    id: row.commercialTaskBilling?.id ?? null,
    task_id: row.id,
    task_name: row.name,
    task_status: row.status,
    billing: row.billing,
    hiring_status: (row.commercialTaskBilling?.hiring_status as CommercialTaskHiringStatus) ?? null,
    payment: row.commercialTaskBilling?.payment ?? null,
    billing_description: row.commercialTaskBilling?.billing_description ?? null,
  };
}

export class CommercialTaskBillingService {
  constructor(
    private readonly prisma: CommercialTaskBillingPrismaDeps = prismaClient,
    private readonly auditDeps: CommercialTaskBillingAuditDeps = audit,
  ) {}

  async list(organization_id: string): Promise<CommercialTaskBilling[]> {
    try {
      const rows = await this.prisma.task.findMany({
        where: { organization_id },
        select: TASK_SELECT,
        orderBy: { name: "asc" },
      });
      return rows.map(toTaskBilling);
    } catch (err: unknown) {
      logError("Erro ao listar cobranças comerciais de tarefas", { err });
      throw new ServiceError(500, "Não foi possível listar as cobranças comerciais.", err);
    }
  }

  async update(data: CommercialTaskBillingRequest): Promise<CommercialTaskBilling> {
    try {
      const eventId = randomUUID();
      const auditCorrelationId = data.audit_correlation_id ?? eventId;
      const result = await this.prisma.$transaction(async (tx) => {
        const task = await tx.task.findFirst({
          where: { id: data.task_id, organization_id: data.organization_id },
          select: { id: true, name: true, status: true, billing: true },
        });
        if (!task) throw new ServiceError(404, "Tarefa não encontrada nesta organização.");

        const current = await tx.commercialTaskBilling.findUnique({
          where: { task_id: data.task_id },
          select: {
            id: true,
            organization_id: true,
            hiring_status: true,
            payment: true,
            billing_description: true,
          },
        });
        if (current && current.organization_id !== data.organization_id) {
          throw new ServiceError(409, "Cobrança comercial pertence a outra organização.");
        }

        const updated = await tx.commercialTaskBilling.upsert({
          where: { task_id: data.task_id },
          create: {
            task_id: data.task_id,
            organization_id: data.organization_id,
            hiring_status: data.hiring_status,
            payment: data.payment ?? null,
            billing_description: data.billing_description ?? null,
          },
          update: {
            hiring_status: data.hiring_status,
            ...(data.payment !== undefined ? { payment: data.payment } : {}),
            ...(data.billing_description !== undefined
              ? { billing_description: data.billing_description }
              : {}),
          },
          select: TASK_BILLING_SELECT,
        });
        const event: CommercialTaskBillingUpdatedEvent = {
          event_id: eventId,
          event_type: COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
          event_version: COMMERCIAL_TASK_BILLING_EVENT_VERSION,
          organization_id: data.organization_id,
          task_id: data.task_id,
          hiring_status: updated.hiring_status as CommercialTaskHiringStatus,
          payment: updated.payment,
          billing_description: updated.billing_description,
          audit_correlation_id: auditCorrelationId,
          occurred_at: new Date().toISOString(),
        };
        await tx.commercialOutboxEvent.create({
          data: {
            id: eventId,
            organization_id: data.organization_id,
            aggregate_id: data.task_id,
            event_type: event.event_type,
            event_version: event.event_version,
            payload: event as unknown as Prisma.InputJsonValue,
            audit_correlation_id: auditCorrelationId,
          },
        });
        return { task, current, updated };
      });

      await this.auditDeps.logUpdateIfChanged({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Atualização de Cobrança Comercial",
        referring: "commercial.task_billing",
        referringId: data.task_id,
        oldData: result.current ?? {},
        updatedData: result.updated,
        auditCorrelationId,
      });
      return {
        id: result.updated.id,
        task_id: result.updated.task_id,
        task_name: result.task.name,
        task_status: result.task.status,
        billing: result.task.billing,
        hiring_status: result.updated.hiring_status as CommercialTaskHiringStatus,
        payment: result.updated.payment,
        billing_description: result.updated.billing_description,
      };
    } catch (err: unknown) {
      logError("Erro ao atualizar cobrança comercial de tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível atualizar a cobrança comercial.", err);
    }
  }
}
