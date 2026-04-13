import { describe, expect, it, vi } from "vitest";

import { terminationBodySchema } from "../schemas/clientVerticals.schemas.js";
import { terminateClient } from "../services/clientTerminationService.js";

describe("terminationBodySchema", () => {
  it("aceita competence_output no formato YYYY-MM", () => {
    const parsed = terminationBodySchema.parse({
      reason: "Pedido",
      description: "Descricao",
      competence_output: "2026-03",
    });

    expect(parsed.competence_output).toBe("2026-03");
  });

  it("rejeita competence_output fora do formato YYYY-MM", () => {
    expect(() =>
      terminationBodySchema.parse({
        reason: "Pedido",
        description: "Descricao",
        competence_output: "2026-3",
      }),
    ).toThrow();
  });
});

describe("terminateClient", () => {
  it("grava a competencia no fim do mes e executa tudo em transacao", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "client-1", status: "Ativo" });
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const update = vi.fn().mockResolvedValue({ id: "client-1" });
    const create = vi.fn().mockResolvedValue({
      id: "term-1",
      client_id: "client-1",
      reason: "Pedido",
      description: "Descricao",
      competence: "2026-03",
      user_id: "user-1",
    });
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        task: { updateMany },
        client: { update },
        clientTermination: { create },
      }),
    );

    const prisma = {
      client: { findFirst },
      $transaction: transaction,
    };

    const result = await terminateClient(
      prisma as never,
      "client-1",
      "org-1",
      "user-1",
      {
        reason: "Pedido",
        description: "Descricao",
        competence_output: "2026-03",
      },
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["A Realizar", "Em andamento", "Em Espera", "Pendente"] },
        client_id: "client-1",
        organization_id: "org-1",
      },
      data: {
        status: "Paralisado",
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: {
        status: "Processo de Inativação",
        competence_output: new Date("2026-03-31T23:59:59.999Z"),
      },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        client_id: "client-1",
        reason: "Pedido",
        description: "Descricao",
        competence: "2026-03",
        user_id: "user-1",
        organization_id: "org-1",
      },
      select: {
        id: true,
        client_id: true,
        reason: true,
        description: true,
        competence: true,
        user_id: true,
      },
    });
    expect(result).toEqual({
      id: "term-1",
      client_id: "client-1",
      reason: "Pedido",
      description: "Descricao",
      competence: "2026-03",
      user_id: "user-1",
    });
  });

  it("falha com 404 quando cliente nao existe", async () => {
    const prisma = {
      client: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(),
    };

    await expect(
      terminateClient(prisma as never, "client-1", "org-1", "user-1", {
        reason: "Pedido",
        description: "Descricao",
        competence_output: "2026-03",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
