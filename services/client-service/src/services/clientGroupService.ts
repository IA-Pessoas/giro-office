import { requireIntegracaoRouteAccess, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";

export type ClientGroupAuthorization = {
  userId: string;
  level: 0 | 1 | 2 | 3;
  isOwner: boolean;
};

function groupSelect(organizationId: string) {
  return {
    id: true,
    name: true,
    status: true,
    organization_id: true,
    clients: {
      where: {
        organization_id: organizationId,
        client: { is: { organization_id: organizationId } },
      },
      select: {
        client: {
          select: { id: true, name: true, company_name: true, fantasy_name: true, cpf_cnpj: true },
        },
      },
    },
  } as const;
}

function presentGroup<T extends { clients: readonly { client: unknown }[] }>(group: T) {
  return { ...group, clients: group.clients.map(({ client }) => client) };
}

export class ClientGroupService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organizationId: string, authorization: ClientGroupAuthorization) {
    requireIntegracaoRouteAccess("GET", "/client/groups", {
      ...authorization,
      organizationId,
      resourceOrganizationId: organizationId,
    });
    const groups = await this.prisma.group.findMany({
      where: { organization_id: organizationId },
      orderBy: { name: "asc" },
      select: groupSelect(organizationId),
    });
    return groups.map(presentGroup);
  }

  async create(organizationId: string, name: string, authorization: ClientGroupAuthorization) {
    requireIntegracaoRouteAccess("POST", "/client/groups", {
      ...authorization,
      organizationId,
      resourceOrganizationId: organizationId,
      requestedFields: ["name"],
    });
    const normalizedName = name.trim();
    if (!normalizedName) throw new ServiceError(400, "Informe o nome do grupo.");
    if (
      await this.prisma.group.findFirst({
        where: { organization_id: organizationId, name: normalizedName },
        select: { id: true },
      })
    ) {
      throw new ServiceError(409, "Já existe um grupo com este nome.");
    }
    const group = await this.prisma.group.create({
      data: { name: normalizedName, organization_id: organizationId },
      select: groupSelect(organizationId),
    });
    return presentGroup(group);
  }

  async update(
    groupId: string,
    organizationId: string,
    name: string,
    authorization: ClientGroupAuthorization,
  ) {
    requireIntegracaoRouteAccess("PATCH", "/client/groups/:id", {
      ...authorization,
      organizationId,
      resourceOrganizationId: organizationId,
      requestedFields: ["name"],
    });
    const normalizedName = name.trim();
    if (!normalizedName) throw new ServiceError(400, "Informe o nome do grupo.");
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, organization_id: organizationId },
      select: { id: true },
    });
    if (!group) throw new ServiceError(404, "Grupo não encontrado.");
    if (
      await this.prisma.group.findFirst({
        where: { organization_id: organizationId, name: normalizedName, id: { not: groupId } },
        select: { id: true },
      })
    ) {
      throw new ServiceError(409, "Já existe um grupo com este nome.");
    }
    return presentGroup(
      await this.prisma.group.update({
        where: { id: groupId },
        data: { name: normalizedName },
        select: groupSelect(organizationId),
      }),
    );
  }

  async replaceClients(
    groupId: string,
    organizationId: string,
    clientIds: readonly string[],
    authorization: ClientGroupAuthorization,
  ): Promise<{ id: string; clients: readonly { id: string }[] }> {
    requireIntegracaoRouteAccess("PUT", "/client/groups/:id/clients", {
      ...authorization,
      organizationId,
      resourceOrganizationId: organizationId,
      requestedFields: ["client_ids"],
    });
    const uniqueClientIds = [...new Set(clientIds)];
    return this.prisma.$transaction(async (transaction) => {
      const group = await transaction.group.findFirst({
        where: { id: groupId, organization_id: organizationId },
        select: { id: true },
      });
      if (!group) throw new ServiceError(404, "Grupo não encontrado.");
      const clients = uniqueClientIds.length
        ? await transaction.client.findMany({
            where: { id: { in: uniqueClientIds }, organization_id: organizationId },
            select: { id: true },
          })
        : [];
      if (clients.length !== uniqueClientIds.length) {
        throw new ServiceError(404, "Um ou mais clientes não foram encontrados nesta organização.");
      }
      await transaction.clientsGroup.deleteMany({
        where: { group_id: groupId, organization_id: organizationId },
      });
      if (uniqueClientIds.length) {
        await transaction.clientsGroup.createMany({
          data: uniqueClientIds.map((clientId) => ({
            group_id: groupId,
            client_id: clientId,
            organization_id: organizationId,
          })),
          skipDuplicates: true,
        });
      }
      return { id: groupId, clients };
    });
  }
}
