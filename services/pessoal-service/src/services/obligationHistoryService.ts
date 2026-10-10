// Histórico por item de obrigação (#1767), lido da auditoria do Pessoal. Usado pelo serviço
// Node e pelo Worker.

import { ServiceError } from "@workspace/shared";
import { type AuditHistoryPrisma, listAuditFieldHistory } from "@workspace/shared/audit";

import { OBLIGATION_ITEMS, type ObligationHistoryQuery } from "../schemas/obligation.schemas.js";

// Quem grava a atualização (Node e Worker) usa estas constantes; o histórico filtra por elas.
export const OBLIGATION_AUDIT_REFERRING = "pessoal.obrigations";
export const OBLIGATION_UPDATE_ACTION = "Atualizacao";
export const OBLIGATION_HISTORY_FIELDS = [...OBLIGATION_ITEMS, "responsavel_id"] as const;

export type ObligationHistoryPrisma = AuditHistoryPrisma & {
  obrigationsPessoal: {
    findFirst(args: unknown): Promise<{ id: string; client_id: string; competence: string } | null>;
  };
};

/** Mudança auditada de um campo: valor anterior e novo. */
export function obligationFieldChange(
  existing: Record<string, unknown>,
  body: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  return Object.fromEntries(
    Object.entries(body).map(([field, to]) => [field, { from: existing[field] ?? null, to }]),
  );
}

export async function listObligationHistory(
  prisma: ObligationHistoryPrisma,
  organizationId: string,
  obligationId: string,
  query: ObligationHistoryQuery,
) {
  const obligation = await prisma.obrigationsPessoal.findFirst({
    where: { id: obligationId, organization_id: organizationId },
    select: { id: true, client_id: true, competence: true },
  });
  if (!obligation) throw new ServiceError(404, "Obrigação de pessoal não encontrada.");

  return {
    obligation_id: obligation.id,
    client_id: obligation.client_id,
    competence: obligation.competence,
    page: query.page,
    pageSize: query.pageSize,
    ...(await listAuditFieldHistory(prisma, {
      organizationId,
      referring: OBLIGATION_AUDIT_REFERRING,
      referringId: obligation.id,
      actions: [OBLIGATION_UPDATE_ACTION],
      fields: OBLIGATION_HISTORY_FIELDS,
      page: query.page,
      pageSize: query.pageSize,
    })),
  };
}
