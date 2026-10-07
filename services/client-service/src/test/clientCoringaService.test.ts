import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  coringaWhere,
  iterateCoringaClients,
  listCoringaClients,
} from "../services/clientCoringaService.js";

const organizationId = "550e8400-e29b-41d4-a716-446655440000";

describe("listCoringaClients", () => {
  it("filtra pelo status próprio da lista e pela data de criação na organização", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const prisma = { client: { findMany, count } } as unknown as PrismaClient;

    const result = await listCoringaClients(prisma, organizationId, {
      dataEntrada: "2026-10-07",
      status: "Em análise",
      tecnologia: true,
      page: 1,
      limit: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: organizationId,
          coringa_status: { equals: "Em análise", mode: "insensitive" },
          tecnologia: true,
          created_at: {
            gte: new Date("2026-10-07T03:00:00.000Z"),
            lt: new Date("2026-10-08T03:00:00.000Z"),
          },
        }),
        skip: 0,
        take: 20,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: findMany.mock.calls[0][0].where });
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20, hasMore: false });
  });
});

it("busca CNPJ formatado pelo documento normalizado", () => {
  expect(coringaWhere(organizationId, { search: "12.345.678/0001-90" })).toMatchObject({
    organization_id: organizationId,
    OR: expect.arrayContaining([{ cpf_cnpj: { contains: "12345678000190", mode: "insensitive" } }]),
  });
});

it("exporta em lotes sem limitar o total filtrado", async () => {
  const firstBatch = Array.from({ length: 500 }, (_, index) => ({ id: `client-${index}` }));
  const findMany = vi
    .fn()
    .mockResolvedValueOnce(firstBatch)
    .mockResolvedValueOnce([{ id: "client-500" }]);
  const prisma = { client: { findMany } } as unknown as PrismaClient;
  const rows = [];
  for await (const batch of iterateCoringaClients(prisma, organizationId, { consultoria: true })) {
    rows.push(...batch);
  }
  expect(rows).toHaveLength(501);
  expect(findMany).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      where: { organization_id: organizationId, consultoria: true },
      cursor: { id: "client-499" },
      skip: 1,
      take: 500,
    }),
  );
});
