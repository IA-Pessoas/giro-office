import { expect, it, vi } from "vitest";
import {
  CommercialProposalConfigService,
  CommercialProspectingService,
  CommercialTaskBillingService,
} from "./commercialService.js";

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

it("mantém o envelope público da prospecção sem expor organization_id", async () => {
  const prisma = {
    commercialProspecting: {
      findFirst: vi.fn().mockResolvedValue({
        id: PROSPECTING,
        client_id: CLIENT,
        status: "Análise Financeira",
        status_date: null,
        description: null,
      }),
    },
    client: {
      findFirst: vi.fn().mockResolvedValue({
        id: CLIENT,
        name: "Cliente",
        company_name: null,
        fantasy_name: null,
      }),
    },
  };
  const result = await new CommercialProspectingService(prisma as never).detail(PROSPECTING, ORG);

  expect(result).toEqual(
    expect.objectContaining({ id: PROSPECTING, client: expect.objectContaining({ id: CLIENT }) }),
  );
  expect(result).not.toHaveProperty("organization_id");
});

it.each(["P2002", "P2034"])("mapeia conflito Prisma de prospecção para 409 (%s)", async (code) => {
  const prisma = {
    $transaction: vi.fn().mockRejectedValue({ code }),
  };
  const service = new CommercialProspectingService(prisma as never);

  await expect(
    service.create({
      user_id: "user-1",
      organization_id: ORG,
      client_id: CLIENT,
      status: "Análise Financeira",
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});

it.each(["P2002", "P2034"])("mapeia conflito Prisma de proposta para 409 (%s)", async (code) => {
  const prisma = {
    proposalConfig: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockRejectedValue({ code }),
    },
  };
  const service = new CommercialProposalConfigService(prisma as never);

  await expect(service.create(ORG, { name: "Mensal", contract_value: 100 })).rejects.toMatchObject({
    statusCode: 409,
  });
});

it.each(["P2002", "P2034"])("mapeia conflito Prisma de billing para 409 (%s)", async (code) => {
  const prisma = {
    $transaction: vi.fn().mockRejectedValue({ code }),
  };
  const service = new CommercialTaskBillingService(prisma as never);

  await expect(
    service.update({
      user_id: "user-1",
      organization_id: ORG,
      task_id: "d0000000-0000-4000-8000-000000000001",
      hiring_status: "Contratado",
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
