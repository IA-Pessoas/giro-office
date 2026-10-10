import { describe, expect, it, vi } from "vitest";
import { type ClientAuditEvent, ClientService } from "./clientService.js";
import type { PrismaClient } from "./generated/prisma/client.js";

const ORG = "org-1";
const regularize = {
  userId: "user-1",
  level: 0,
  permission: 2,
  modules: { regularize: 2 },
  isOwner: false,
};

function setup(licitacao: boolean | null) {
  const history: Array<Record<string, unknown>> = [];
  const tx = {
    client: {
      findFirst: vi.fn(async () => ({ licitacao })),
      update: vi.fn(async ({ data }) => ({ id: "client-1", ...data })),
    },
    clientLicitacaoHistory: {
      create: vi.fn(async ({ data }) => {
        history.push(data);
        return data;
      }),
    },
  };
  const prisma = {
    organization: { findUnique: vi.fn().mockResolvedValue({ id: ORG }) },
    client: {
      findFirst: vi.fn(async ({ where }) =>
        where.organization_id === ORG ? { id: "client-1", type: "PJ", licitacao } : null,
      ),
      findMany: vi.fn(async () => [{ id: "client-1", name: "Acme", status: "Ativo" }]),
    },
    clientLicitacaoHistory: {
      findMany: vi.fn(async () => [
        {
          id: "h1",
          previous_value: null,
          new_value: true,
          actor_user_id: "user-1",
          created_at: new Date("2026-10-09T12:00:00.000Z"),
        },
      ]),
    },
    user: { findMany: vi.fn(async () => [{ id: "user-1", name: "Ana" }]) },
    clientRegime: { findFirst: vi.fn() },
    clientSegment: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)),
  };
  const events: ClientAuditEvent[] = [];
  const service = new ClientService(
    prisma as unknown as PrismaClient,
    undefined,
    undefined,
    undefined,
    false,
    async (event) => {
      events.push(event);
    },
  );
  return { prisma, tx, history, service, events };
}

describe("licitação no Regularize", () => {
  it.each([
    [null, true],
    [true, false],
    [false, null],
  ])("registra a troca de %s para %s com ator e valores", async (from, to) => {
    const { history, events, service } = setup(from);
    await service.updateRegularize("client-1", ORG, "user-1", { licitacao: to });
    expect(history).toEqual([
      {
        organization_id: ORG,
        client_id: "client-1",
        previous_value: from,
        new_value: to,
        actor_user_id: "user-1",
      },
    ]);
    expect(events[0]).toMatchObject({ changes: { licitacao: { from, to } } });
  });

  it("não registra histórico quando o valor não muda ou não é enviado", async () => {
    const { history, service } = setup(null);
    await service.updateRegularize("client-1", ORG, "user-1", { licitacao: null });
    await service.updateRegularize("client-1", ORG, "user-1", { coringa_status: "Em análise" });
    expect(history).toEqual([]);
  });

  it("mostra o histórico com ator, instante e valores anterior/novo", async () => {
    const { service } = setup(true);
    await expect(service.listLicitacaoHistory("client-1", ORG, regularize)).resolves.toEqual([
      {
        id: "h1",
        previous_value: null,
        new_value: true,
        created_at: "2026-10-09T12:00:00.000Z",
        actor: { id: "user-1", name: "Ana" },
      },
    ]);
    await expect(
      service.listLicitacaoHistory("client-1", "org-2", regularize),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lista licitantes só com Sim entre ativos ou em inativação da organização", async () => {
    const { prisma, service } = setup(true);
    await service.listLicitacaoBidders(ORG, regularize);
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: ORG,
          licitacao: true,
          status: { in: ["Ativo", "Processo de Inativação"] },
        },
      }),
    );
  });
});
