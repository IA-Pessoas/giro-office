import prismaClient from "../integrations/prisma.js";

export type CommercialOutboxStatusPrismaDeps = Pick<typeof prismaClient, "commercialOutboxEvent">;

export class CommercialOutboxStatusService {
  constructor(private readonly prisma: CommercialOutboxStatusPrismaDeps = prismaClient) {}

  async status(organizationId: string): Promise<{
    counts: Record<string, number>;
    latestFailure: { attempts: number; last_error: string | null } | null;
  }> {
    const rows = await this.prisma.commercialOutboxEvent.findMany({
      where: { organization_id: organizationId },
      select: { status: true, attempts: true, last_error: true },
      orderBy: { updated_at: "desc" },
      take: 50,
    });
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
    const failure = rows.find((row) => row.status === "failed" || row.last_error !== null);
    return { counts, latestFailure: failure ?? null };
  }
}
