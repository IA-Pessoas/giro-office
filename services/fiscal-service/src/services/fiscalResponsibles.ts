import type { PrismaClient } from "../generated/prisma/client.js";

/** Responsável fiscal padrão de cada cliente (carteira vigente, mantida na Triagem). */
export async function loadDefaultResponsibles(
  prisma: Pick<PrismaClient, "triageResponsible">,
  organizationId: string,
  clientIds: string[],
): Promise<Map<string, string>> {
  if (!clientIds.length) return new Map();
  const rows = await prisma.triageResponsible.findMany({
    where: { organization_id: organizationId, type: "FISCAL", client_id: { in: clientIds } },
    select: { client_id: true, user_id: true },
  });
  return new Map(rows.map((row) => [row.client_id, row.user_id]));
}

/** Nomes dos usuários com vínculo na organização. */
export async function loadUserNames(
  prisma: Pick<PrismaClient, "user">,
  organizationId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique }, permissions: { some: { organization_id: organizationId } } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
}

/** Usuário ativo com acesso ao Fiscal na organização: quem pode ser responsável. */
export function fiscalUserWhere(organizationId: string) {
  return {
    status: "active",
    permissions: { some: { organization_id: organizationId, fiscal: { gt: 0 } } },
  };
}
