import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { GroupMapService } from "../services/groupMapService.js";

const ORG = "a0000000-0000-4000-8000-000000000001";
const GROUP_ID = "d0000000-0000-4000-8000-000000000001";

type Company = {
  id: string;
  name: string;
  company_name: string | null;
  cpf_cnpj: string | null;
  status: string;
  city: string | null;
  address: string | null;
  number: string | null;
  neighborhood: string | null;
  regime: string | null;
};

function company(id: string, overrides: Partial<Company> = {}): Company {
  return {
    id,
    name: `Empresa ${id}`,
    company_name: `Empresa ${id} LTDA`,
    cpf_cnpj: "11111111000111",
    status: "Ativo",
    city: "Salvador",
    address: "Rua A",
    number: "10",
    neighborhood: "Centro",
    regime: "Simples Nacional",
    ...overrides,
  };
}

// Vínculos societários: pf é sócio de pj; exit null = vigente.
type Bond = { pj: Company; pf_id: string; pf_name: string; exit: Date | null };

function createPrisma(members: Company[], bonds: Bond[], group: { name: string } | null) {
  const prisma = {
    group: {
      findFirst: vi.fn(async (_args: Record<string, unknown>) =>
        group ? { id: GROUP_ID, name: group.name } : null,
      ),
    },
    clientsGroup: {
      findMany: vi.fn(async (_args: Record<string, unknown>) =>
        members.map((client) => ({ client: { id: client.id, city: client.city } })),
      ),
    },
    partners: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        // Sócios das empresas do grupo.
        if ("pj_id" in args.where) {
          const ids = (args.where.pj_id as { in: string[] }).in;
          return bonds
            .filter((bond) => ids.includes(bond.pj.id))
            .map((bond) => ({
              pj_id: bond.pj.id,
              pf_id: bond.pf_id,
              clientPF: { name: bond.pf_name },
            }));
        }
        // Empresas dos sócios com vínculo vigente.
        const ids = (args.where.pf_id as { in: string[] }).in;
        return bonds
          .filter((bond) => ids.includes(bond.pf_id) && bond.exit === null)
          .map((bond) => ({ pf_id: bond.pf_id, clientPJ: bond.pj }));
      }),
    },
  };
  return prisma;
}

function serviceFor(prisma: ReturnType<typeof createPrisma>) {
  return new GroupMapService(prisma as unknown as PrismaClient);
}

describe("GroupMapService.generate", () => {
  it("monta grupo, cidade, sócio e empresas com situação, sede e regime", async () => {
    const alfa = company("alfa");
    const prisma = createPrisma([alfa], [{ pj: alfa, pf_id: "pf-1", pf_name: "Ana", exit: null }], {
      name: "Grupo Um",
    });

    const map = await serviceFor(prisma).generate({ organizationId: ORG, groupId: GROUP_ID });

    expect(map).toEqual({
      group: { id: GROUP_ID, name: "Grupo Um" },
      cities: [
        {
          name: "Salvador",
          partners: [
            {
              pf_id: "pf-1",
              name: "Ana",
              companies: [
                {
                  client_id: "alfa",
                  name: "Empresa alfa LTDA",
                  cpf_cnpj: "11111111000111",
                  status: "Ativo",
                  address: "Rua A, 10 (Centro)",
                  regime: "Simples Nacional",
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("mostra empresa inativa quando o vínculo do sócio está vigente", async () => {
    const alfa = company("alfa");
    const beta = company("beta", {
      status: "Inativo",
      regime: null,
      address: null,
      neighborhood: null,
    });
    const prisma = createPrisma(
      [alfa],
      [
        { pj: alfa, pf_id: "pf-1", pf_name: "Ana", exit: null },
        { pj: beta, pf_id: "pf-1", pf_name: "Ana", exit: null },
      ],
      { name: "Grupo Um" },
    );

    const map = await serviceFor(prisma).generate({ organizationId: ORG, groupId: GROUP_ID });

    const companies = map.cities[0]?.partners[0]?.companies ?? [];
    expect(companies.map((item) => [item.client_id, item.status])).toEqual([
      ["alfa", "Ativo"],
      ["beta", "Inativo"],
    ]);
    // Empresa fora do grupo entra pelo sócio; campo vazio fica nulo, não inventado.
    expect(companies[1]).toMatchObject({ address: null, regime: null });
    expect(JSON.stringify(map)).not.toMatch(/capital|rbt12/i);
  });

  it("deixa de fora a empresa de onde o sócio já saiu", async () => {
    const alfa = company("alfa");
    const gama = company("gama");
    const prisma = createPrisma(
      [alfa],
      [
        { pj: alfa, pf_id: "pf-1", pf_name: "Ana", exit: null },
        { pj: gama, pf_id: "pf-1", pf_name: "Ana", exit: new Date("2025-01-01") },
      ],
      { name: "Grupo Um" },
    );

    const map = await serviceFor(prisma).generate({ organizationId: ORG, groupId: GROUP_ID });

    expect(map.cities[0]?.partners[0]?.companies.map((item) => item.client_id)).toEqual(["alfa"]);
    expect(prisma.partners.findMany.mock.calls[1]?.[0].where).toMatchObject({
      organization_id: ORG,
      exit: null,
    });
  });

  it("separa por cidade, sem repetir o sócio na mesma cidade", async () => {
    const alfa = company("alfa");
    const beta = company("beta", { city: " salvador " });
    const delta = company("delta", { city: "Feira de Santana" });
    const prisma = createPrisma(
      [alfa, beta, delta],
      [
        { pj: alfa, pf_id: "pf-1", pf_name: "Ana", exit: null },
        { pj: beta, pf_id: "pf-1", pf_name: "Ana", exit: null },
        { pj: delta, pf_id: "pf-1", pf_name: "Ana", exit: null },
      ],
      { name: "Grupo Um" },
    );

    const map = await serviceFor(prisma).generate({ organizationId: ORG, groupId: GROUP_ID });

    expect(
      map.cities.map((city) => [
        city.name,
        city.partners.map((partner) => partner.companies.map((item) => item.client_id)),
      ]),
    ).toEqual([
      ["Salvador", [["alfa", "beta"]]],
      ["Feira de Santana", [["delta"]]],
    ]);
  });

  it("responde 404 para grupo de outra organização", async () => {
    const prisma = createPrisma([], [], null);

    await expect(
      serviceFor(prisma).generate({ organizationId: ORG, groupId: GROUP_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.group.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: GROUP_ID, organization_id: ORG } }),
    );
    expect(prisma.clientsGroup.findMany).not.toHaveBeenCalled();
  });
});
