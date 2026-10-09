import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { ClientWholesaleService } from "../services/clientWholesaleService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "c0000000-0000-4000-8000-000000000001";
const clientId = "d0000000-0000-4000-8000-000000000001";

type Row = {
  organization_id: string;
  client_id: string;
  sequence: number;
  previous_value: boolean;
  new_value: boolean;
  actor_user_id: string;
  created_at: Date;
};

function dependencies(rows: Row[] = []) {
  const history = {
    findMany: vi.fn(async () => [...rows].sort((a, b) => b.sequence - a.sequence)),
    findFirst: vi.fn(async () => [...rows].sort((a, b) => b.sequence - a.sequence)[0] ?? null),
    create: vi.fn(async ({ data }: { data: Omit<Row, "created_at"> }) => {
      const row = { ...data, created_at: new Date("2026-10-09T12:00:00.000Z") };
      rows.push(row);
      return row;
    }),
  };
  const prisma = {
    client: { findFirst: vi.fn(async () => ({ id: clientId }) as { id: string } | null) },
    fiscalClientWholesaleHistory: history,
  };
  const audit = { createLog: vi.fn(async () => {}) };
  return { prisma, audit, service: new ClientWholesaleService(prisma as never, audit) };
}

const actor = { organizationId, userId, permission: 2 };

describe("ClientWholesaleService", () => {
  it("sem trilha o cliente não é atacadista", async () => {
    const { service } = dependencies();
    await expect(service.get(clientId, organizationId)).resolves.toEqual({
      client_id: clientId,
      is_wholesale: false,
      updated_at: null,
      updated_by: null,
      history: [],
    });
  });

  it("marca atacadista com ator, momento, anterior e novo, sem reescrever a trilha", async () => {
    const rows: Row[] = [
      {
        organization_id: organizationId,
        client_id: clientId,
        sequence: 1,
        previous_value: false,
        new_value: true,
        actor_user_id: "outro",
        created_at: new Date("2026-01-10T12:00:00.000Z"),
      },
    ];
    const { prisma, service, audit } = dependencies(rows);

    const result = await service.set({ ...actor, clientId, isWholesale: false });

    expect(prisma.fiscalClientWholesaleHistory.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        client_id: clientId,
        sequence: 2,
        previous_value: true,
        new_value: false,
        actor_user_id: userId,
      },
    });
    expect(result.is_wholesale).toBe(false);
    expect(result.history.map((row) => row.new_value)).toEqual([false, true]);
    expect(result.history[1]).toMatchObject({ actor_user_id: "outro" });
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { is_wholesale: { from: true, to: false } } }),
    );
  });

  it("repetir o valor atual não grava trilha nem auditoria", async () => {
    const { prisma, service, audit } = dependencies();
    await service.set({ ...actor, clientId, isWholesale: false });
    expect(prisma.fiscalClientWholesaleHistory.create).not.toHaveBeenCalled();
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it("cliente de outra organização é 404 e nada é gravado", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findFirst.mockResolvedValue(null);

    await expect(service.get(clientId, organizationId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.set({ ...actor, clientId, isWholesale: true })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    expect(prisma.fiscalClientWholesaleHistory.create).not.toHaveBeenCalled();
  });

  it("alteração simultânea vira 409 pela sequência única", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalClientWholesaleHistory.create.mockRejectedValueOnce({ code: "P2002" });
    await expect(service.set({ ...actor, clientId, isWholesale: true })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
