import { ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { GroupMapTreeNode } from "../schemas/groupMap.schemas.js";
import { currentPartnerBondWhere } from "./partnersService.js";
import { RegularizeLogService } from "./regularizeLogService.js";

// Mapa gerado de grupo (#1748), como o regularize/pages/mapas/mapa.php do legado (?grupo=id):
// grupo → cidade das empresas do grupo → sócios dessas empresas → empresas de cada sócio com
// vínculo vigente naquela cidade. O legado imprimia "Capital Social" e "RBT12" sempre vazios;
// aqui esses campos não existem, para ninguém tomar um número calculado por dado do cadastro.

export type GroupMapCompany = {
  client_id: string;
  name: string;
  cpf_cnpj: string | null;
  status: string;
  address: string | null;
  regime: string | null;
};

export type GroupMapPartner = {
  pf_id: string;
  name: string;
  companies: GroupMapCompany[];
};

export type GroupMapCity = {
  // Vazio quando o cadastro da empresa não tem cidade.
  name: string;
  partners: GroupMapPartner[];
};

export type GroupMap = {
  group: { id: string; name: string };
  cities: GroupMapCity[];
};

const companySelect = {
  id: true,
  name: true,
  company_name: true,
  cpf_cnpj: true,
  status: true,
  city: true,
  address: true,
  number: true,
  neighborhood: true,
  regime: true,
} as const;

export type GroupMapCompanyRow = Prisma.ClientGetPayload<{ select: typeof companySelect }>;
type CompanyRow = GroupMapCompanyRow;

// "Salvador" e " salvador " são a mesma cidade: o cadastro é digitado.
function cityKey(city: string | null): string {
  return (city ?? "").trim().toLocaleLowerCase("pt-BR");
}

// Sede como o legado: endereço (bairro), agora com o número.
function formatAddress(company: CompanyRow): string | null {
  const address = company.address?.trim();
  // Número sem logradouro não diz nada.
  const street = address ? [address, company.number?.trim()].filter(Boolean).join(", ") : "";
  const neighborhood = company.neighborhood?.trim();
  if (!street) return neighborhood || null;
  return neighborhood ? `${street} (${neighborhood})` : street;
}

function toCompany(company: CompanyRow): GroupMapCompany {
  return {
    client_id: company.id,
    name: company.company_name?.trim() || company.name,
    cpf_cnpj: company.cpf_cnpj || null,
    status: company.status,
    address: formatAddress(company),
    regime: company.regime?.trim() || null,
  };
}

export type GroupSavedMap = {
  tree: GroupMapTreeNode;
  updated_at: Date;
  updated_by_user_id: string;
};

const savedMapSelect = {
  id: true,
  tree: true,
  updated_at: true,
  updated_by_user_id: true,
} as const;

function toSavedMap(
  saved: Prisma.RegularizeGroupSavedMapGetPayload<{ select: typeof savedMapSelect }>,
): GroupSavedMap {
  return {
    // Só entra no banco pela validação de save().
    tree: saved.tree as unknown as GroupMapTreeNode,
    updated_at: saved.updated_at,
    updated_by_user_id: saved.updated_by_user_id,
  };
}

export class GroupMapService {
  constructor(private readonly prisma: PrismaClient) {}

  async generate(input: { organizationId: string; groupId: string }): Promise<GroupMap> {
    const group = await this.requireGroup(input.organizationId, input.groupId);

    const members = await this.prisma.clientsGroup.findMany({
      where: { group_id: group.id, organization_id: input.organizationId },
      select: { client: { select: { id: true, city: true } } },
      orderBy: { client: { name: "asc" } },
    });
    const memberIds = members.map((member) => member.client.id);

    // Sócios das empresas do grupo. Como no legado, o sócio que já saiu da empresa do grupo
    // também entra: o que precisa estar vigente é o vínculo com as empresas listadas abaixo dele.
    const memberBonds = await this.prisma.partners.findMany({
      where: { organization_id: input.organizationId, pj_id: { in: memberIds } },
      select: { pj_id: true, pf_id: true, clientPF: { select: { name: true } } },
      orderBy: [{ entry: "asc" }, { id: "asc" }],
    });
    const partnerIds = [...new Set(memberBonds.map((bond) => bond.pf_id))];

    const currentBonds = await this.prisma.partners.findMany({
      where: {
        organization_id: input.organizationId,
        pf_id: { in: partnerIds },
        ...currentPartnerBondWhere(),
      },
      select: { pf_id: true, clientPJ: { select: companySelect } },
      orderBy: [{ entry: "asc" }, { id: "asc" }],
    });
    const companiesByPartner = new Map<string, CompanyRow[]>();
    for (const bond of currentBonds) {
      const companies = companiesByPartner.get(bond.pf_id) ?? [];
      if (!companies.some((company) => company.id === bond.clientPJ.id)) {
        companies.push(bond.clientPJ);
      }
      companiesByPartner.set(bond.pf_id, companies);
    }

    const cities = new Map<string, GroupMapCity>();
    for (const member of members) {
      const key = cityKey(member.client.city);
      let city = cities.get(key);
      if (!city) {
        city = { name: (member.client.city ?? "").trim(), partners: [] };
        cities.set(key, city);
      }
      for (const bond of memberBonds) {
        if (bond.pj_id !== member.client.id) continue;
        // O sócio aparece uma vez por cidade, mesmo sendo sócio de várias empresas do grupo.
        if (city.partners.some((partner) => partner.pf_id === bond.pf_id)) continue;
        const companies = (companiesByPartner.get(bond.pf_id) ?? []).filter(
          (company) => cityKey(company.city) === key,
        );
        // Só entra o sócio com ao menos uma empresa vigente na cidade.
        if (companies.length === 0) continue;
        city.partners.push({
          pf_id: bond.pf_id,
          name: bond.clientPF.name,
          companies: companies.map(toCompany),
        });
      }
    }

    return {
      group,
      cities: [...cities.values()],
    };
  }

  // Versão salva do mapa do grupo (#1749), ou null quando o grupo ainda não tem uma.
  async getSaved(input: {
    organizationId: string;
    groupId: string;
  }): Promise<GroupSavedMap | null> {
    await this.requireGroup(input.organizationId, input.groupId);
    const saved = await this.prisma.regularizeGroupSavedMap.findUnique({
      where: {
        organization_id_group_id: {
          organization_id: input.organizationId,
          group_id: input.groupId,
        },
      },
      select: savedMapSelect,
    });
    return saved ? toSavedMap(saved) : null;
  }

  // Grava a árvore como a pessoa editou. É a única escrita: gerar o mapa de novo não mexe aqui.
  async save(input: {
    organizationId: string;
    userId: string;
    groupId: string;
    tree: GroupMapTreeNode;
  }): Promise<GroupSavedMap> {
    await this.requireGroup(input.organizationId, input.groupId);
    const key = { organization_id: input.organizationId, group_id: input.groupId };
    const tree = input.tree as unknown as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.regularizeGroupSavedMap.findUnique({
        where: { organization_id_group_id: key },
        select: { id: true },
      });
      const saved = await transaction.regularizeGroupSavedMap.upsert({
        where: { organization_id_group_id: key },
        create: { ...key, tree, updated_by_user_id: input.userId },
        update: { tree, updated_by_user_id: input.userId },
        select: savedMapSelect,
      });
      // O histórico registra quem salvou e quando; a árvore anterior não é guardada.
      await new RegularizeLogService(transaction).createLog({
        userId: input.userId,
        organizationId: input.organizationId,
        action: existing ? "Atualizacao" : "Cadastro",
        referring: "regularize.group_maps",
        referringId: saved.id,
        changes: { group_id: input.groupId },
      });
      return toSavedMap(saved);
    });
  }

  private async requireGroup(
    organizationId: string,
    groupId: string,
  ): Promise<{ id: string; name: string }> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, organization_id: organizationId },
      select: { id: true, name: true },
    });
    if (!group) throw new ServiceError(404, "Grupo não encontrado.");
    return group;
  }
}
