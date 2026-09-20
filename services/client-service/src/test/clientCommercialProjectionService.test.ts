import { describe, expect, it, vi } from "vitest";

import type { CommercialProspectingTransitionEvent } from "../schemas/commercialProjection.schemas.js";
import { ClientCommercialProjectionService } from "../services/clientCommercialProjectionService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";

function transition(
  status: CommercialProspectingTransitionEvent["to_status"],
  id = "c0000000-0000-4000-8000-000000000001",
): CommercialProspectingTransitionEvent {
  return {
    event_id: id,
    event_type: "commercial.prospecting.transition",
    event_version: 1,
    organization_id: ORGANIZATION_ID,
    client_id: CLIENT_ID,
    prospecting_id: "d0000000-0000-4000-8000-000000000001",
    from_status: null,
    to_status: status,
    status_date: "2026-09-10T00:00:00.000Z",
    description: "Atualização comercial",
    audit_correlation_id: id,
    occurred_at: "2026-09-10T00:00:00.000Z",
  };
}

function createPrismaMock() {
  const ledger = new Map<string, { organization_id: string; client_id: string }>();
  const prisma = {
    client: {
      findFirst: vi.fn(async (_args: unknown) => ({
        id: CLIENT_ID,
        name: "Cliente A",
        company_name: null,
        fantasy_name: null,
        service_unique: false,
        type_registration: "Novo",
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    clientCommercialProjectionEvent: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => ledger.get(where.id) ?? null,
      ),
      create: vi.fn(
        async ({ data }: { data: { id: string; organization_id: string; client_id: string } }) => {
          ledger.set(data.id, data);
          return data;
        },
      ),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(prisma),
  );
  return prisma;
}

describe("ClientCommercialProjectionService", () => {
  it("mapeia Fechado para cliente ativo e torna reentrega idempotente", async () => {
    const prisma = createPrismaMock();
    const service = new ClientCommercialProjectionService(prisma as never);
    const event = transition("Fechado");

    const first = await service.apply(event);
    const duplicate = await service.apply(event);

    expect(first).toEqual({
      event_id: event.event_id,
      applied: true,
      duplicate: false,
      client_id: CLIENT_ID,
      client: {
        id: CLIENT_ID,
        name: "Cliente A",
        company_name: null,
        fantasy_name: null,
        service_unique: false,
        type_registration: "Novo",
      },
    });
    expect(duplicate).toEqual({
      event_id: event.event_id,
      applied: false,
      duplicate: true,
      client_id: CLIENT_ID,
      client: {
        id: CLIENT_ID,
        name: "Cliente A",
        company_name: null,
        fantasy_name: null,
        service_unique: false,
        type_registration: "Novo",
      },
    });
    expect(prisma.client.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.client.updateMany).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, organization_id: ORGANIZATION_ID },
      data: expect.objectContaining({ status: "Ativo", prospecting_status: "Fechado" }),
    });
  });

  it.each([
    ["Paralisado", "Paralisado"],
    ["Recusado pelo Cliente", "Não Contratado"],
    ["Análise/Agendamento", "Prospecção"],
  ] as const)("preserva o mapeamento legado %s -> %s", async (commercialStatus: CommercialProspectingTransitionEvent["to_status"], clientStatus: string) => {
    const prisma = createPrismaMock();
    const service = new ClientCommercialProjectionService(prisma as never);

    await service.apply(transition(commercialStatus));

    expect(prisma.client.updateMany).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, organization_id: ORGANIZATION_ID },
      data: expect.objectContaining({ status: clientStatus, prospecting_status: commercialStatus }),
    });
  });

  it("não aceita reentrega do mesmo evento para outro tenant", async () => {
    const prisma = createPrismaMock();
    prisma.clientCommercialProjectionEvent.findUnique.mockResolvedValue({
      organization_id: "a0000000-0000-4000-8000-000000000099",
      client_id: CLIENT_ID,
    });
    const service = new ClientCommercialProjectionService(prisma as never);

    await expect(service.apply(transition("Fechado"))).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
  });
});
