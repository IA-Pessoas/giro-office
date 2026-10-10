import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";
import { listObligationPortfolioQuerySchema } from "../schemas/obligation.schemas.js";
import {
  buildObligationPortfolioWhere,
  listObligationPortfolio,
} from "../services/obligationPortfolioService.js";
import { organizationId, responsibleId } from "./pessoalCoreTestUtils.js";

const GROUP_ID = "c0000000-0000-4000-8000-000000000001";

function parse(query: Record<string, string>) {
  return listObligationPortfolioQuerySchema.parse({ competence: "2026-09", ...query });
}

describe("carteira de obrigacoes", () => {
  it("prende a consulta a organizacao e competencia com paginacao padrao", () => {
    const query = parse({});

    expect(query).toMatchObject({ page: 1, page_size: 50 });
    expect(buildObligationPortfolioWhere(organizationId, query)).toEqual({
      organization_id: organizationId,
      competence: "2026-09",
    });
  });

  it("filtra responsavel, grupo historico e estado do item", () => {
    const where = (state: string) =>
      buildObligationPortfolioWhere(
        organizationId,
        parse({ responsavel_id: responsibleId, group_id: GROUP_ID, item: "va", state }),
      );

    expect(where("pending")).toEqual({
      organization_id: organizationId,
      competence: "2026-09",
      responsavel_id: responsibleId,
      group_snapshot_id: GROUP_ID,
      va: false,
    });
    expect(where("done")).toMatchObject({ va: true });
    expect(where("none")).toMatchObject({ va: null });
  });

  it("pendente sem item busca qualquer dos oito itens pendente", () => {
    const where = buildObligationPortfolioWhere(organizationId, parse({ state: "pending" }));

    expect(where.OR).toHaveLength(8);
    expect(where.OR).toContainEqual({ assistance_fee: false });
  });

  it("rejeita estado concluido sem item, item invalido e pagina acima do limite", () => {
    expect(() => parse({ state: "done" })).toThrow();
    expect(() => parse({ item: "client_id", state: "pending" })).toThrow();
    expect(() => parse({ page_size: "101" })).toThrow();
    expect(() => parse({ organization_id: organizationId })).toThrow();
  });

  it("pagina no banco e devolve total", async () => {
    const prisma = {
      obrigationsPessoal: {
        findMany: vi.fn(async () => [{ id: "1" }]),
        count: vi.fn(async () => 51),
      },
    };

    const result = await listObligationPortfolio(
      prisma,
      organizationId,
      parse({ page: "2", page_size: "25" }),
    );

    expect(result).toEqual({ items: [{ id: "1" }], total: 51, page: 2, page_size: 25 });
    expect(prisma.obrigationsPessoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId, competence: "2026-09" },
        skip: 25,
        take: 25,
      }),
    );
    expect(prisma.obrigationsPessoal.count).toHaveBeenCalledWith({
      where: { organization_id: organizationId, competence: "2026-09" },
    });
  });
});
