import { ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { CommercialProspectingTransitionEvent } from "../schemas/commercialProjection.schemas.js";

export interface ClientCommercialProjectionResult {
  event_id: string;
  applied: boolean;
  duplicate: boolean;
  client_id: string;
}

export type ClientCommercialProjectionPrismaDeps = Pick<
  PrismaClient,
  "$transaction" | "client" | "clientCommercialProjectionEvent"
>;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function mapClientStatus(status: CommercialProspectingTransitionEvent["to_status"]): string {
  switch (status) {
    case "Fechado":
      return "Ativo";
    case "Paralisado":
      return "Paralisado";
    case "Recusado pelo Cliente":
      return "Não Contratado";
    default:
      return "Prospecção";
  }
}

export class ClientCommercialProjectionService {
  constructor(private readonly prisma: ClientCommercialProjectionPrismaDeps) {}

  async apply(
    event: CommercialProspectingTransitionEvent,
  ): Promise<ClientCommercialProjectionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const previous = await tx.clientCommercialProjectionEvent.findUnique({
          where: { id: event.event_id },
          select: { organization_id: true, client_id: true },
        });
        if (previous) {
          if (
            previous.organization_id !== event.organization_id ||
            previous.client_id !== event.client_id
          ) {
            throw new ServiceError(409, "Evento comercial pertence a outro tenant.");
          }
          return {
            event_id: event.event_id,
            applied: false,
            duplicate: true,
            client_id: event.client_id,
          };
        }

        const client = await tx.client.findFirst({
          where: { id: event.client_id, organization_id: event.organization_id },
          select: { id: true },
        });
        if (!client) throw new ServiceError(404, "Cliente não encontrado nesta organização.");

        const updated = await tx.client.updateMany({
          where: { id: event.client_id, organization_id: event.organization_id },
          data: {
            status: mapClientStatus(event.to_status),
            prospecting_status: event.to_status,
            date_status: event.status_date ? new Date(event.status_date) : null,
            description_prospecting: event.description,
          },
        });
        if (updated.count !== 1) {
          throw new ServiceError(404, "Cliente não encontrado nesta organização.");
        }
        await tx.clientCommercialProjectionEvent.create({
          data: {
            id: event.event_id,
            organization_id: event.organization_id,
            client_id: event.client_id,
            event_type: event.event_type,
            audit_correlation_id: event.audit_correlation_id,
          },
        });

        return {
          event_id: event.event_id,
          applied: true,
          duplicate: false,
          client_id: event.client_id,
        };
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (isUniqueConstraintError(error)) {
        throw new ServiceError(409, "Evento comercial já está sendo processado.", error);
      }
      throw error;
    }
  }
}
