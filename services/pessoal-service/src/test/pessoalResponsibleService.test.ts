import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";
import { ensurePessoalResponsible } from "../services/pessoalResponsibleService.js";
import { organizationId, responsibleId } from "./pessoalCoreTestUtils.js";

describe("ensurePessoalResponsible", () => {
  it("exige usuario ativo com permissao de Pessoal na organizacao", async () => {
    const prisma = {
      user: { findFirst: vi.fn(async () => ({ id: responsibleId })) },
    };

    await ensurePessoalResponsible(prisma as never, organizationId, responsibleId);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: responsibleId,
        status: "active",
        OR: [
          { organization_id: organizationId },
          { organization_id: null, department: { organization_id: organizationId } },
        ],
        permissions: {
          some: { organization_id: organizationId, pessoal: { gt: 0 } },
        },
      },
      select: { id: true },
    });
  });

  it("rejeita usuario fora do contexto de Pessoal", async () => {
    const prisma = {
      user: { findFirst: vi.fn(async () => null) },
    };

    await expect(
      ensurePessoalResponsible(prisma as never, organizationId, responsibleId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("preserva responsavel legado atual sem exigir nova elegibilidade", async () => {
    const prisma = {
      user: { findFirst: vi.fn() },
    };

    await ensurePessoalResponsible(prisma as never, organizationId, responsibleId, responsibleId);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
