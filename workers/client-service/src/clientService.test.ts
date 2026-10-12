import { describe, expect, it, vi } from "vitest";
import { ClientService } from "./clientService.js";
import type { PrismaClient } from "./generated/prisma/client.js";

describe("ClientService.listInstagramProfiles", () => {
  it("pagina e totaliza o mesmo recorte de organização, perfil, situação e busca", async () => {
    const items = [{ id: "client-1", name: "Acme", status: "Ativo", instagram: null }];
    const queryRaw = vi.fn().mockResolvedValue([{ total: 201, items }]);
    const service = new ClientService({ $queryRaw: queryRaw } as unknown as PrismaClient);

    const result = await service.listInstagramProfiles("org-1", {
      page: 2,
      pageSize: 100,
      profile: "without",
      status: "Ativo",
      search: " Acme ",
    });

    expect(result).toEqual({ items, total: 201, page: 2, pageSize: 100, hasMore: true });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [sql, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(sql.join("?")).toContain("c.organization_id = ?");
    expect(values).toEqual(expect.arrayContaining(["org-1", "without", "Ativo", "%Acme%", 100]));
  });

  it("devolve página vazia quando nada casa", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ total: 0, items: [] }]);
    const service = new ClientService({ $queryRaw: queryRaw } as unknown as PrismaClient);

    await expect(
      service.listInstagramProfiles("org-1", { page: 1, pageSize: 20, profile: "all" }),
    ).resolves.toEqual({ items: [], total: 0, page: 1, pageSize: 20, hasMore: false });
  });
});

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
