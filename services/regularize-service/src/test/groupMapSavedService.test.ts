import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { GroupMapTreeNode } from "../schemas/groupMap.schemas.js";
import { GroupMapService } from "../services/groupMapService.js";

const ORG = "a0000000-0000-4000-8000-000000000001";
const GROUP_ID = "d0000000-0000-4000-8000-000000000001";
const SAVED_AT = new Date("2026-10-10T12:00:00.000Z");

const tree: GroupMapTreeNode = {
  id: "raiz",
  lines: ["Grupo Um"],
  children: [{ id: "extra", lines: ["Anotação"], color: "#ffff00", children: [] }],
};

type SavedRow = { id: string; tree: unknown; updated_at: Date; updated_by_user_id: string };

// Uma versão por organização e grupo, como o índice único garante no banco.
function createPrisma(groupOrganization: string | null = ORG) {
  const rows = new Map<string, SavedRow>();
  const keyOf = (where: {
    organization_id_group_id: { organization_id: string; group_id: string };
  }) =>
    `${where.organization_id_group_id.organization_id}:${where.organization_id_group_id.group_id}`;
  const prisma = {
    rows,
    group: {
      findFirst: vi.fn(async (args: { where: { id: string; organization_id: string } }) =>
        args.where.organization_id === groupOrganization
          ? { id: GROUP_ID, name: "Grupo Um" }
          : null,
      ),
    },
    regularizeGroupSavedMap: {
      findUnique: vi.fn(async (args: { where: Parameters<typeof keyOf>[0] }) => {
        return rows.get(keyOf(args.where)) ?? null;
      }),
      upsert: vi.fn(
        async (args: {
          where: Parameters<typeof keyOf>[0];
          create: { tree: unknown; updated_by_user_id: string };
        }) => {
          const row = {
            id: "saved-1",
            tree: args.create.tree,
            updated_at: SAVED_AT,
            updated_by_user_id: args.create.updated_by_user_id,
          };
          rows.set(keyOf(args.where), row);
          return row;
        },
      ),
    },
    logs: { create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})) },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  return prisma;
}

function serviceFor(prisma: ReturnType<typeof createPrisma>) {
  return new GroupMapService(prisma as unknown as PrismaClient);
}

describe("GroupMapService versão salva", () => {
  const scope = { organizationId: ORG, groupId: GROUP_ID };

  it("devolve null enquanto o grupo não tem versão salva", async () => {
    const prisma = createPrisma();

    expect(await serviceFor(prisma).getSaved(scope)).toBeNull();
  });

  it("reabre a árvore exatamente como foi salva", async () => {
    const prisma = createPrisma();
    const service = serviceFor(prisma);

    const saved = await service.save({ ...scope, userId: "user-1", tree });

    expect(saved).toEqual({ tree, updated_at: SAVED_AT, updated_by_user_id: "user-1" });
    expect(await service.getSaved(scope)).toEqual(saved);
    expect(prisma.logs.create).toHaveBeenCalledWith({
      data: {
        user_id: "user-1",
        organization_id: ORG,
        action: "Cadastro",
        referring: "regularize.group_maps",
        referring_id: "saved-1",
        changes: { group_id: GROUP_ID },
      },
    });
  });

  it("substitui a versão do grupo ao salvar de novo e registra como atualização", async () => {
    const prisma = createPrisma();
    const service = serviceFor(prisma);
    await service.save({ ...scope, userId: "user-1", tree });
    const edited = { ...tree, lines: ["Grupo Um (revisado)"] };

    await service.save({ ...scope, userId: "user-2", tree: edited });

    expect(prisma.rows.size).toBe(1);
    expect(await service.getSaved(scope)).toMatchObject({
      tree: edited,
      updated_by_user_id: "user-2",
    });
    expect(prisma.logs.create.mock.calls[1]?.[0].data.action).toBe("Atualizacao");
  });

  it("gerar o mapa de novo não altera a versão salva", async () => {
    const prisma = createPrisma();
    const service = serviceFor(prisma);
    await service.save({ ...scope, userId: "user-1", tree });
    Object.assign(prisma, {
      clientsGroup: { findMany: vi.fn(async () => []) },
      partners: { findMany: vi.fn(async () => []) },
    });

    await service.generate(scope);

    expect(prisma.regularizeGroupSavedMap.upsert).toHaveBeenCalledTimes(1);
    expect(await service.getSaved(scope)).toMatchObject({ tree });
  });

  it("responde 404 ao ler ou gravar em grupo de outra organização", async () => {
    const prisma = createPrisma("outra-org");
    const service = serviceFor(prisma);

    await expect(service.getSaved(scope)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.save({ ...scope, userId: "user-1", tree })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.regularizeGroupSavedMap.upsert).not.toHaveBeenCalled();
  });
});
