import type { ServiceBinding } from "@workspace/runtime";
import { ServiceError } from "@workspace/shared/http";
import type { PrismaClient } from "./generated/prisma/client.js";

export type ClientAuthorization = {
  userId: string;
  level: number;
  permission?: number;
  isOwner: boolean;
};

export type ClientFilters = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  ref?: "integracao" | "deps";
};

export type ClientWorkerService = {
  listByOrganization: (
    organizationId: string,
    filters: ClientFilters,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  getById: (
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  create: (input: Record<string, unknown>, authorization: ClientAuthorization) => Promise<unknown>;
  update: (
    id: string,
    organizationId: string,
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  deactivate: (
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  activate: (
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  lookupCnpj: (cnpj: string, organizationId: string) => Promise<unknown>;
  createIntegration: (
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  updateIntegration: (
    id: string,
    organizationId: string,
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  listHistories: (clientId: string, organizationId: string) => Promise<unknown>;
  createHistory: (
    clientId: string,
    organizationId: string,
    userId: string,
    input: { date: Date; history: string; pending_id?: string; file?: string | null },
  ) => Promise<unknown>;
  getHistory: (clientId: string, historyId: string, organizationId: string) => Promise<unknown>;
  getHistoryFileUrl: (
    clientId: string,
    historyId: string,
    organizationId: string,
  ) => Promise<unknown>;
  updateHistory: (
    historyId: string,
    organizationId: string,
    userId: string,
    input: { date: Date; history: string },
  ) => Promise<unknown>;
  createPending: (
    clientId: string,
    organizationId: string,
    userId: string,
    reason: string,
  ) => Promise<unknown>;
  listPending: (organizationId: string, userId?: string) => Promise<unknown>;
  deletePending: (pendingId: string, organizationId: string) => Promise<void>;
};

type ClientRow = Record<string, unknown>;

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  logo_url: true,
  status: true,
  subscription_plan: true,
} as const;

const clientSelect = {
  id: true,
  name: true,
  organization_id: true,
  status: true,
  cpf_cnpj: true,
  company_name: true,
  fantasy_name: true,
  service_unique: true,
  deletion_date: true,
  dominio_code: true,
  address: true,
  cep: true,
  neighborhood: true,
  state: true,
  city: true,
  customer_since: true,
  opening_date: true,
  responsible: true,
  email: true,
} as const;

function requirePermission(auth: ClientAuthorization, minimum: number): void {
  if (!auth.isOwner && auth.level < minimum) {
    throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
  }
}

function serialize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function toPublic(row: ClientRow, organization: ClientRow): ClientRow {
  return Object.fromEntries(
    Object.entries({
      ...row,
      service_unique: row.service_unique ?? false,
      deletion_date: serialize(row.deletion_date ?? null),
      organization,
    }).map(([key, value]) => [key, serialize(value)]),
  );
}

export class ClientService implements ClientWorkerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cnpjService?: ServiceBinding,
  ) {}

  private async organization(organizationId: string): Promise<ClientRow> {
    const row = await (this.prisma as any).organization.findUnique({
      where: { id: organizationId },
      select: organizationSelect,
    });
    if (!row) throw new ServiceError(404, "Organização não encontrada.");
    return row;
  }

  private async client(id: string, organizationId: string): Promise<ClientRow> {
    const row = await (this.prisma as any).client.findFirst({
      where: { id, organization_id: organizationId },
      select: clientSelect,
    });
    if (!row) throw new ServiceError(404, "Cliente não encontrado.");
    return row;
  }

  async listByOrganization(
    organizationId: string,
    filters: ClientFilters,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 1);
    const where: Record<string, unknown> = { organization_id: organizationId };
    if (filters.status && filters.status !== "Todos")
      where.status = filters.status === "Prospect" ? "Prospecção" : filters.status;
    if (filters.search?.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { company_name: { contains: term, mode: "insensitive" } },
        { fantasy_name: { contains: term, mode: "insensitive" } },
        { cpf_cnpj: { contains: term, mode: "insensitive" } },
      ];
    }
    const organization = await this.organization(organizationId);
    const rows = await (this.prisma as any).client.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: clientSelect,
    });
    const total = await (this.prisma as any).client.count({ where });
    return {
      items: rows.map((row: ClientRow) => toPublic(row, organization)),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      hasMore: filters.page * filters.pageSize < total,
    };
  }

  async getById(
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 1);
    return toPublic(await this.client(id, organizationId), await this.organization(organizationId));
  }

  async create(
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 2);
    const organizationId = String(input.organization_id);
    const organization = await this.organization(organizationId);
    const row = await (this.prisma as any).client.create({
      data: { ...input, organization_id: organizationId },
      select: clientSelect,
    });
    return toPublic(row, organization);
  }

  async update(
    id: string,
    organizationId: string,
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 2);
    await this.client(id, organizationId);
    const row = await (this.prisma as any).client.update({
      where: { id },
      data: input,
      select: clientSelect,
    });
    return toPublic(row, await this.organization(organizationId));
  }

  async deactivate(
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 3);
    await this.client(id, organizationId);
    const row = await (this.prisma as any).client.update({
      where: { id },
      data: { status: "Inativo", deletion_date: new Date() },
      select: clientSelect,
    });
    return toPublic(row, await this.organization(organizationId));
  }

  async activate(
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 3);
    await this.client(id, organizationId);
    const row = await (this.prisma as any).client.update({
      where: { id },
      data: { status: "Ativo", deletion_date: null },
      select: clientSelect,
    });
    return toPublic(row, await this.organization(organizationId));
  }

  async lookupCnpj(cnpj: string): Promise<unknown> {
    if (!this.cnpjService) throw new ServiceError(503, "Consulta oficial de CNPJ indisponível.");
    let response: Response;
    try {
      response = await this.cnpjService.fetch(
        new Request(`https://cnpj-service.internal/lookup?cnpj=${encodeURIComponent(cnpj)}`),
      );
    } catch {
      throw new ServiceError(502, "O provedor oficial de CNPJ não respondeu corretamente.");
    }
    if (!response.ok)
      throw new ServiceError(502, "O provedor oficial de CNPJ não respondeu corretamente.");
    return response.json();
  }

  async createIntegration(
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    return this.create(input, authorization);
  }

  async updateIntegration(
    id: string,
    organizationId: string,
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    return this.update(id, organizationId, input, authorization);
  }

  private async ensureClient(id: string, organizationId: string): Promise<void> {
    await this.client(id, organizationId);
  }

  async listHistories(clientId: string, organizationId: string): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    return {
      list: await (this.prisma as any).clientHistory.findMany({
        where: { client_id: clientId, organization_id: organizationId },
        orderBy: { date: "asc" },
        select: { id: true, client_id: true, date: true, history: true, file: true, user_id: true },
      }),
    };
  }

  async createHistory(
    clientId: string,
    organizationId: string,
    userId: string,
    input: { date: Date; history: string; pending_id?: string; file?: string | null },
  ): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    const row = await (this.prisma as any).clientHistory.create({
      data: {
        client_id: clientId,
        organization_id: organizationId,
        user_id: userId,
        date: input.date,
        history: input.history,
        file: input.file ?? null,
      },
      select: { id: true, client_id: true, date: true, history: true, file: true, user_id: true },
    });
    if (input.pending_id) {
      await (this.prisma as any).clientHistoryPending.deleteMany({
        where: { id: input.pending_id, client_id: clientId, organization_id: organizationId },
      });
    }
    return row;
  }

  async getHistory(clientId: string, historyId: string, organizationId: string): Promise<unknown> {
    const row = await (this.prisma as any).clientHistory.findFirst({
      where: { id: historyId, client_id: clientId, organization_id: organizationId },
      select: { id: true, client_id: true, date: true, history: true, file: true, user_id: true },
    });
    if (!row) throw new ServiceError(404, "Histórico não encontrado.");
    return { detail: row };
  }

  async getHistoryFileUrl(
    clientId: string,
    historyId: string,
    organizationId: string,
  ): Promise<unknown> {
    const row = (await this.getHistory(clientId, historyId, organizationId)) as {
      detail: ClientRow;
    };
    if (!row.detail.file) throw new ServiceError(404, "Anexo não encontrado.");
    return { url: row.detail.file };
  }

  async updateHistory(
    historyId: string,
    organizationId: string,
    userId: string,
    input: { date: Date; history: string },
  ): Promise<unknown> {
    const existing = await (this.prisma as any).clientHistory.findFirst({
      where: { id: historyId, organization_id: organizationId },
      select: { id: true, user_id: true },
    });
    if (!existing) throw new ServiceError(404, "Histórico não encontrado.");
    if (existing.user_id !== userId)
      throw new ServiceError(403, "Usuário não tem permissão para editar este histórico.");
    return (this.prisma as any).clientHistory.update({
      where: { id: historyId },
      data: input,
      select: { id: true, date: true, history: true, user_id: true },
    });
  }

  async createPending(
    clientId: string,
    organizationId: string,
    userId: string,
    reason: string,
  ): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    return (this.prisma as any).clientHistoryPending.create({
      data: { client_id: clientId, organization_id: organizationId, user_id: userId, reason },
      select: { id: true, user_id: true, client_id: true, reason: true },
    });
  }

  async listPending(organizationId: string, userId?: string): Promise<unknown> {
    return {
      list: await (this.prisma as any).clientHistoryPending.findMany({
        where: { organization_id: organizationId, ...(userId ? { user_id: userId } : {}) },
        select: { id: true, reason: true, client_id: true },
      }),
    };
  }

  async deletePending(pendingId: string, organizationId: string): Promise<void> {
    const exists = await (this.prisma as any).clientHistoryPending.findFirst({
      where: { id: pendingId, organization_id: organizationId },
      select: { id: true },
    });
    if (!exists) throw new ServiceError(404, "Pendência não encontrada.");
    await (this.prisma as any).clientHistoryPending.delete({ where: { id: pendingId } });
  }
}
