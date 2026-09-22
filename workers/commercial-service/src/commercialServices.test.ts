import { expect, it, vi } from "vitest";
import { CommercialProspectingService } from "./commercialService.js";

const ORG = "a0000000-0000-4000-8000-000000000001";
const CLIENT = "b0000000-0000-4000-8000-000000000001";
const PROSPECTING = "c0000000-0000-4000-8000-000000000001";

it("persiste prospecção e evento de projeção no mesmo tenant", async () => {
  const client = { id: CLIENT, name: "Cliente", company_name: null, fantasy_name: null };
  const prisma = {
    client: { findFirst: vi.fn().mockResolvedValue(client) },
    commercialProspecting: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: PROSPECTING,
        client_id: CLIENT,
        status: "Análise Financeira",
        status_date: null,
        description: null,
      }),
    },
    commercialOutboxEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
    $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)),
  };
  const audit = { createLog: vi.fn().mockResolvedValue(undefined) };
  const service = new CommercialProspectingService(prisma as never, audit);

  await service.create({
    user_id: "user-1",
    organization_id: ORG,
    client_id: CLIENT,
    status: "Análise Financeira",
  });

  expect(prisma.commercialProspecting.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ client_id: CLIENT, organization_id: ORG }),
    }),
  );
  expect(prisma.commercialOutboxEvent.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ organization_id: ORG, aggregate_id: PROSPECTING }),
    }),
  );
});
