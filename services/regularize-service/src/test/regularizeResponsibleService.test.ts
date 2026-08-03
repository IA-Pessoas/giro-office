import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";
import { ensureRegularizeResponsible } from "../services/regularizeResponsibleService.js";

const organizationId = "00000000-0000-4000-8000-000000000001";
const responsibleId = "00000000-0000-4000-8000-000000000002";

describe("ensureRegularizeResponsible", () => {
  it("exige usuario ativo com permissao Regularize na organizacao", async () => {
    const prisma = { user: { findFirst: vi.fn(async () => ({ id: responsibleId })) } };

    await ensureRegularizeResponsible(prisma as never, organizationId, responsibleId);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: responsibleId,
        status: "active",
        OR: [
          { organization_id: organizationId },
          { organization_id: null, department: { organization_id: organizationId } },
        ],
        permissions: { some: { organization_id: organizationId, regularize: { gt: 0 } } },
      },
      select: { id: true },
    });
  });

  it("preserva responsavel legado atual", async () => {
    const prisma = { user: { findFirst: vi.fn() } };

    await ensureRegularizeResponsible(
      prisma as never,
      organizationId,
      responsibleId,
      responsibleId,
    );

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
