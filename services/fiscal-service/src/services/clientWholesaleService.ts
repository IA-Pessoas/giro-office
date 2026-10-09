import { ServiceError } from "@workspace/shared/http";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLogParams } from "../integrations/audit.js";

// Sem imports Node no topo: o Worker fiscal reaproveita este serviço como está.

export type ClientWholesalePrisma = Pick<PrismaClient, "client" | "fiscalClientWholesaleHistory">;

const REFERRING = "fiscal.client_wholesale_history";
const CONFLICT_MESSAGE =
  "A condição de atacadista foi alterada por outra pessoa. Recarregue e tente de novo.";

export interface ClientWholesaleDto {
  client_id: string;
  is_wholesale: boolean;
  updated_at: string | null;
  updated_by: string | null;
  history: Array<{
    previous_value: boolean;
    new_value: boolean;
    actor_user_id: string;
    created_at: string;
  }>;
}

/**
 * Condição de atacadista do cliente. A trilha é append-only e o valor atual é a última linha
 * (sem linha = não atacadista), então nada do passado é reescrito. É só informativa:
 * nenhuma marcação aciona cálculo de antecipação.
 */
export class ClientWholesaleService {
  constructor(
    private readonly prisma: ClientWholesalePrisma,
    private readonly audit: { createLog(params: CreateLogParams): Promise<void> },
  ) {}

  private async requireClient(clientId: string, organizationId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!client) throw new ServiceError(404, "Cliente não encontrado.");
  }

  async get(clientId: string, organizationId: string): Promise<ClientWholesaleDto> {
    await this.requireClient(clientId, organizationId);
    const history = await this.prisma.fiscalClientWholesaleHistory.findMany({
      where: { organization_id: organizationId, client_id: clientId },
      orderBy: [{ sequence: "desc" }],
    });
    const last = history[0];
    return {
      client_id: clientId,
      is_wholesale: last?.new_value ?? false,
      updated_at: last?.created_at.toISOString() ?? null,
      updated_by: last?.actor_user_id ?? null,
      history: history.map((row) => ({
        previous_value: row.previous_value,
        new_value: row.new_value,
        actor_user_id: row.actor_user_id,
        created_at: row.created_at.toISOString(),
      })),
    };
  }

  async set(input: {
    clientId: string;
    isWholesale: boolean;
    organizationId: string;
    userId: string;
    permission?: number;
  }): Promise<ClientWholesaleDto> {
    await this.requireClient(input.clientId, input.organizationId);
    const last = await this.prisma.fiscalClientWholesaleHistory.findFirst({
      where: { organization_id: input.organizationId, client_id: input.clientId },
      orderBy: [{ sequence: "desc" }],
      select: { sequence: true, new_value: true },
    });
    const current = last?.new_value ?? false;
    // Mesmo valor: nada muda, nada entra na trilha.
    if (current === input.isWholesale) return this.get(input.clientId, input.organizationId);

    try {
      await this.prisma.fiscalClientWholesaleHistory.create({
        data: {
          organization_id: input.organizationId,
          client_id: input.clientId,
          sequence: (last?.sequence ?? 0) + 1,
          previous_value: current,
          new_value: input.isWholesale,
          actor_user_id: input.userId,
        },
      });
    } catch (error) {
      // Sequência única por cliente: outra alteração gravou primeiro.
      if ((error as { code?: unknown } | null)?.code === "P2002") {
        throw new ServiceError(409, CONFLICT_MESSAGE);
      }
      throw error;
    }

    await this.audit.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission ?? null,
      action: "Atualização",
      referring: REFERRING,
      referringId: input.clientId,
      changes: { is_wholesale: { from: current, to: input.isWholesale } },
    });
    return this.get(input.clientId, input.organizationId);
  }
}
