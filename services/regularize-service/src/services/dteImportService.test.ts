import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { DteImportService } from "./dteImportService.js";

const ORG = "a0000000-0000-4000-8000-000000000001";

function notice(aviso: string) {
  return { tipo: "badge badge-important", cell3: aviso, cell4: "123", cell5: "Dest" };
}

// Banco em memória só com o que o serviço usa; o índice único fica por conta do Set.
function createPrisma(existingKeys: string[] = []) {
  const stored = new Set(existingKeys.map((key) => `${ORG}:${key}`));
  const imports: Record<string, unknown>[] = [];
  const prisma = {
    regularizeDteNotice: {
      findMany: vi.fn(
        async (args: { where: { organization_id: string; dedupe_key: { in: string[] } } }) =>
          args.where.dedupe_key.in
            .filter((key) => stored.has(`${args.where.organization_id}:${key}`))
            .map((dedupe_key) => ({ dedupe_key })),
      ),
      createMany: vi.fn(
        async (args: { data: Array<{ organization_id: string; dedupe_key: string }> }) => {
          let count = 0;
          for (const row of args.data) {
            const key = `${row.organization_id}:${row.dedupe_key}`;
            if (stored.has(key)) continue;
            stored.add(key);
            count++;
          }
          return { count };
        },
      ),
    },
    regularizeDteImport: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        imports.push(args.data);
        return args.data;
      }),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        ...imports[imports.length - 1],
        ...args.data,
      })),
      findMany: vi.fn(async () => imports),
      count: vi.fn(async () => imports.length),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  return prisma;
}

function serviceFor(prisma: ReturnType<typeof createPrisma>) {
  return new DteImportService(prisma as unknown as PrismaClient);
}

describe("DteImportService", () => {
  it("grava os avisos novos na organização e devolve o resumo conferível", async () => {
    const prisma = createPrisma();
    const content = JSON.stringify([notice("Aviso 1"), "lixo", notice("Aviso 2")]);

    const result = await serviceFor(prisma).importNotices({
      organizationId: ORG,
      userId: "user-1",
      format: "json",
      content,
    });

    expect(result).toMatchObject({
      organization_id: ORG,
      user_id: "user-1",
      format: "json",
      total_rows: 3,
      created_count: 2,
      duplicate_count: 0,
      rejected_count: 1,
      duplicates: [],
      rejections: [{ row: 2, reason: "ITEM_INVALIDO" }],
    });
    const created = prisma.regularizeDteNotice.createMany.mock.calls[0]?.[0].data ?? [];
    expect(created).toHaveLength(2);
    expect(created.every((row) => row.organization_id === ORG)).toBe(true);
    expect(created[0]).toMatchObject({ aviso: "Aviso 1", pending_reading: true });
    // O conteúdo colado não é guardado.
    expect(JSON.stringify(prisma.regularizeDteImport.create.mock.calls)).not.toContain("lixo");
  });

  it("não recria aviso já importado nem repetido na mesma colagem", async () => {
    const prisma = createPrisma();
    const service = serviceFor(prisma);
    const input = { organizationId: ORG, userId: "user-1", format: "json" as const };
    await service.importNotices({ ...input, content: JSON.stringify([notice("Aviso 1")]) });

    const result = await service.importNotices({
      ...input,
      content: JSON.stringify([notice("Aviso 1"), notice("Aviso 2"), notice("Aviso 2")]),
    });

    expect(result).toMatchObject({
      created_count: 1,
      duplicate_count: 2,
      duplicates: [
        { row: 1, aviso: "Aviso 1", cnpj_cpf: "123" },
        { row: 3, aviso: "Aviso 2", cnpj_cpf: "123" },
      ],
    });
  });

  it("procura duplicatas só dentro da organização", async () => {
    const prisma = createPrisma();
    const service = serviceFor(prisma);
    const content = JSON.stringify([notice("Aviso 1")]);
    await service.importNotices({ organizationId: ORG, userId: "u", format: "json", content });

    const other = await service.importNotices({
      organizationId: "outra-org",
      userId: "u",
      format: "json",
      content,
    });

    expect(other.created_count).toBe(1);
    expect(prisma.regularizeDteNotice.findMany.mock.calls[1]?.[0].where.organization_id).toBe(
      "outra-org",
    );
  });

  it("corrige a contagem quando outra importação grava o mesmo aviso no meio", async () => {
    const prisma = createPrisma();
    prisma.regularizeDteNotice.createMany.mockResolvedValueOnce({ count: 0 });

    const result = await serviceFor(prisma).importNotices({
      organizationId: ORG,
      userId: "u",
      format: "json",
      content: JSON.stringify([notice("Aviso 1")]),
    });

    expect(result).toMatchObject({ created_count: 0, duplicate_count: 1 });
  });

  it("lista as importações da organização, da mais recente para a mais antiga", async () => {
    const prisma = createPrisma();

    const page = await serviceFor(prisma).listImports({ organizationId: ORG, page: 2, limit: 10 });

    expect(prisma.regularizeDteImport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG },
        orderBy: { created_at: "desc" },
        skip: 10,
        take: 10,
      }),
    );
    expect(page).toEqual({ data: [], total: 0, page: 2, limit: 10, hasMore: false });
  });
});
