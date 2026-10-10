// Histórico da Relação Contábil (#1723): campos do relacionamento do cliente, inclusive os
// estados de licitação e plano de contas.
import { AUDIT_CREATE_ACTION, AUDIT_UPDATE_ACTION } from "./auditActions.js";
import {
  type AuditHistoryPage,
  type AuditHistoryPrisma,
  listAuditFieldHistory,
} from "./auditHistoryService.js";

export const RELATIONSHIP_AUDIT_REFERRING = "contabil.relationship";
export const RELATIONSHIP_HISTORY_FIELDS = [
  "bidding",
  "chart_accounts",
  "tool",
  "system",
  "note",
] as const;

export type RelationshipHistoryPrisma = AuditHistoryPrisma & {
  relationshipContabil: { findFirst(args: unknown): Promise<{ id: string } | null> };
};

export type RelationshipHistoryInput = AuditHistoryPage & {
  organizationId: string;
  clientId: string;
};

export async function listRelationshipHistory(
  prisma: RelationshipHistoryPrisma,
  input: RelationshipHistoryInput,
) {
  const base = { client_id: input.clientId, page: input.page, pageSize: input.pageSize };
  const relationship = await prisma.relationshipContabil.findFirst({
    where: { organization_id: input.organizationId, client_id: input.clientId },
    select: { id: true },
  });
  if (!relationship) return { ...base, total: 0, items: [] };

  return {
    ...base,
    ...(await listAuditFieldHistory(prisma, {
      organizationId: input.organizationId,
      referring: RELATIONSHIP_AUDIT_REFERRING,
      referringId: relationship.id,
      // Cadastro grava os valores iniciais como `null → valor` (#1723).
      actions: [AUDIT_CREATE_ACTION, AUDIT_UPDATE_ACTION],
      fields: RELATIONSHIP_HISTORY_FIELDS,
      page: input.page,
      pageSize: input.pageSize,
    })),
  };
}
