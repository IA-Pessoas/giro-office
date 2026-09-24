import { describe, expect, it, vi } from "vitest";
import { ClientService } from "./clientService.js";
import type { PrismaClient } from "./generated/prisma/client.js";

describe("ClientService.terminate", () => {
  it.each([
    "Inativo",
    "Processo de Inativação",
    "Prospecção",
    "Paralisado",
  ])("rejects terminating a client that is already %s", async (status) => {
    const prisma = {
      client: { findFirst: vi.fn().mockResolvedValue({ id: "client-1", status }) },
      $transaction: vi.fn(),
    } as unknown as PrismaClient;
    const service = new ClientService(prisma);

    await expect(
      service.terminate("client-1", "org-1", "user-1", {
        reason: "Pedido",
        description: "Descricao",
        competence_output: "2026-03",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Só é possível inativar cliente ativo.",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
