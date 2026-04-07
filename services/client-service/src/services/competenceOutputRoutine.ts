import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Rotina alinhada ao legado `competenceOutputUpdate`: inativa clientes com competência de saída
 * já vencida e status `Processo de Inativação`.
 */
export async function runCompetenceOutputUpdate(
  prisma: PrismaClient,
): Promise<{ updated: number }> {
  const clients = await prisma.client.findMany({
    where: {
      competence_output: { lte: new Date() },
      status: "Processo de Inativação",
    },
    select: { id: true },
  });

  if (clients.length === 0) {
    return { updated: 0 };
  }

  await prisma.client.updateMany({
    where: {
      id: { in: clients.map((c) => c.id) },
    },
    data: { status: "Inativo" },
  });

  return { updated: clients.length };
}
