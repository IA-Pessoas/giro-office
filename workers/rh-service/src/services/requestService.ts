import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { RhNotificationService } from "./rhNotificationService.js";

const REQUEST_SELECT = {
  id: true,
  title: true,
  description: true,
  requester_user_id: true,
  requester: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  category_id: true,
  assigned_to_user_id: true,
  assigned_to: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  urgency: true,
  status: true,
  created_at: true,
  updated_at: true,
  organization_id: true,
} as const;

const RH_OPERATION_PERMISSION = 1;

export type RhRequestSnapshot = Prisma.RhRequestGetPayload<{
  select: typeof REQUEST_SELECT;
}>;

export interface RequestCreateInput {
  organization_id: string;
  requester_user_id: string;
  title: string;
  description: string;
  category_id: string;
  assigned_to_user_id?: string;
  urgency: "Low" | "Medium" | "High";
}

export interface RequestUpdateInput {
  id: string;
  organization_id: string;
  actor_user_id?: string;
  title?: string;
  description?: string;
  category_id?: string;
  assigned_to_user_id?: string;
  urgency?: "Low" | "Medium" | "High";
  status?: "New" | "In_Progress" | "Resolved" | "Closed";
}

export interface RequestDeleteInput {
  id: string;
  organization_id: string;
}

export interface RequestListOptions {
  page: number;
  limit: number;
  status?: "New" | "In_Progress" | "Resolved" | "Closed";
  category_id?: string;
  requester_user_id?: string;
  assigned_to_user_id?: string;
  participant_user_id?: string;
}

export interface RhRequestListPage {
  items: RhRequestSnapshot[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

class RequestService {
  private readonly rhNotificationService: RhNotificationService;

  constructor(private readonly prismaClient: PrismaClient) {
    this.rhNotificationService = new RhNotificationService(prismaClient);
  }

  private ensureAssigneeIsNotRequester(requesterUserId: string, assignedToUserId: string): void {
    if (requesterUserId === assignedToUserId) {
      throw new ServiceError(
        400,
        "O responsável pela solicitação não pode ser o mesmo usuário que a abriu.",
      );
    }
  }

  private async findEligibleRhAssignee(
    organizationId: string,
    requesterUserId: string,
    candidateUserId?: string,
  ): Promise<string> {
    const assignee = await this.prismaClient.user.findFirst({
      where: {
        status: "active",
        id: candidateUserId
          ? { equals: candidateUserId, not: requesterUserId }
          : { not: requesterUserId },
        OR: [
          { organization_id: organizationId },
          { organization_id: null, department: { organization_id: organizationId } },
        ],
        permissions: {
          some: {
            organization_id: organizationId,
            rh: { gte: RH_OPERATION_PERMISSION },
          },
        },
      },
      orderBy: { name: "asc" },
      select: { id: true },
    });

    if (!assignee) {
      throw new ServiceError(
        candidateUserId ? 400 : 404,
        candidateUserId
          ? "O responsável informado não está ativo, no escopo da organização ou autorizado no módulo RH."
          : "Nenhum responsavel de RH elegivel encontrado para atribuir a solicitacao.",
      );
    }

    return assignee.id;
  }

  private async requireCategoryInOrg(organizationId: string, categoryId: string): Promise<void> {
    const category = await this.prismaClient.rhCategory.findFirst({
      where: { id: categoryId, organization_id: organizationId, active: true },
      select: { id: true },
    });
    if (!category) {
      throw new ServiceError(404, "Categoria não encontrada.");
    }
  }

  async create(input: RequestCreateInput): Promise<RhRequestSnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const requesterUserId = assertNonEmptyString(input.requester_user_id, "requester_user_id");
      const title = assertNonEmptyString(input.title, "title");
      const description = assertNonEmptyString(input.description, "description");
      const categoryId = assertNonEmptyString(input.category_id, "category_id");
      const requestedAssigneeId =
        input.assigned_to_user_id !== undefined
          ? assertNonEmptyString(input.assigned_to_user_id, "assigned_to_user_id")
          : undefined;

      await this.requireCategoryInOrg(organizationId, categoryId);
      const assignedToUserId = await this.findEligibleRhAssignee(
        organizationId,
        requesterUserId,
        requestedAssigneeId,
      );
      this.ensureAssigneeIsNotRequester(requesterUserId, assignedToUserId);

      const created = await this.prismaClient.rhRequest.create({
        data: {
          title,
          description,
          requester_user_id: requesterUserId,
          category_id: categoryId,
          assigned_to_user_id: assignedToUserId,
          urgency: input.urgency,
          status: "New",
          organization_id: organizationId,
        },
        select: REQUEST_SELECT,
      });

      await this.rhNotificationService.notify({
        organization_id: organizationId,
        user_id: assignedToUserId,
        request_id: created.id,
        event_key: "request-created",
        title: "Nova solicitação de RH",
        message: `A solicitação “${created.title}” foi atribuída a você.`,
      });

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar solicitação RH", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao criar solicitação. ${msg}`, err);
    }
  }

  async update(input: RequestUpdateInput): Promise<RhRequestSnapshot> {
    try {
      const id = assertNonEmptyString(input.id, "id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");

      const hasField =
        input.title !== undefined ||
        input.description !== undefined ||
        input.category_id !== undefined ||
        input.assigned_to_user_id !== undefined ||
        input.urgency !== undefined ||
        input.status !== undefined;

      if (!hasField) {
        throw new ServiceError(400, "Informe ao menos um campo para atualizar.");
      }

      const existing = await this.prismaClient.rhRequest.findFirst({
        where: { id, organization_id: organizationId },
        select: REQUEST_SELECT,
      });

      if (!existing) {
        throw new ServiceError(404, "Solicitação não encontrada.");
      }

      const data: {
        title?: string;
        description?: string;
        category_id?: string;
        assigned_to_user_id?: string;
        urgency?: "Low" | "Medium" | "High";
        status?: "New" | "In_Progress" | "Resolved" | "Closed";
      } = {};

      if (input.title !== undefined) {
        data.title = assertNonEmptyString(input.title, "title");
      }
      if (input.description !== undefined) {
        data.description = assertNonEmptyString(input.description, "description");
      }
      if (input.category_id !== undefined) {
        const categoryId = assertNonEmptyString(input.category_id, "category_id");
        await this.requireCategoryInOrg(organizationId, categoryId);
        data.category_id = categoryId;
      }
      if (input.assigned_to_user_id !== undefined) {
        const candidateUserId = assertNonEmptyString(
          input.assigned_to_user_id,
          "assigned_to_user_id",
        );
        data.assigned_to_user_id = await this.findEligibleRhAssignee(
          organizationId,
          existing.requester_user_id,
          candidateUserId,
        );
      }
      if (input.urgency !== undefined) {
        data.urgency = input.urgency;
      }
      if (input.status !== undefined) {
        if (input.status !== existing.status) {
          const allowedNextStatus: Record<string, string> = {
            New: "In_Progress",
            In_Progress: "Resolved",
            Resolved: "Closed",
          };
          if (allowedNextStatus[existing.status] !== input.status) {
            throw new ServiceError(409, "Transição de status inválida para esta solicitação.");
          }
        }
        data.status = input.status;
      }

      const isFinishing =
        data.status !== existing.status && (data.status === "Resolved" || data.status === "Closed");
      if (isFinishing && data.assigned_to_user_id === undefined && !existing.assigned_to) {
        throw new ServiceError(409, "Atribua um responsável antes de resolver a solicitação.");
      }

      const assigneeAfterUpdate = assertNonEmptyString(
        data.assigned_to_user_id ?? existing.assigned_to_user_id ?? undefined,
        "assigned_to_user_id",
      );
      this.ensureAssigneeIsNotRequester(existing.requester_user_id, assigneeAfterUpdate);

      const updated = await this.prismaClient.rhRequest.update({
        where: { id },
        data,
        select: REQUEST_SELECT,
      });

      const recipients = [updated.requester_user_id, updated.assigned_to_user_id].filter(
        (recipientId, index, all) =>
          recipientId !== input.actor_user_id && all.indexOf(recipientId) === index,
      );
      for (const recipientId of recipients) {
        await this.rhNotificationService.notify({
          organization_id: organizationId,
          user_id: recipientId,
          request_id: updated.id,
          event_key: `request-updated:${crypto.randomUUID()}`,
          title: "Solicitação de RH atualizada",
          message: `A solicitação “${updated.title}” foi atualizada.`,
        });
      }

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar solicitação RH", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao atualizar solicitação. ${msg}`, err);
    }
  }

  async list(organizationId: string, options: RequestListOptions): Promise<RhRequestListPage> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");

      const where: Prisma.RhRequestWhereInput = {
        organization_id: orgId,
      };
      if (options.participant_user_id !== undefined) {
        where.OR = [
          { requester_user_id: options.participant_user_id },
          { assigned_to_user_id: options.participant_user_id },
        ];
      }
      if (options.status !== undefined) {
        where.status = options.status;
      }
      if (options.category_id !== undefined) {
        where.category_id = options.category_id;
      }
      if (options.requester_user_id !== undefined && options.participant_user_id === undefined) {
        where.requester_user_id = options.requester_user_id;
      }
      if (options.assigned_to_user_id !== undefined && options.participant_user_id === undefined) {
        where.assigned_to_user_id = options.assigned_to_user_id;
      }

      const [items, total] = await Promise.all([
        this.prismaClient.rhRequest.findMany({
          where,
          orderBy: { created_at: "desc" },
          skip: (options.page - 1) * options.limit,
          take: options.limit,
          select: REQUEST_SELECT,
        }),
        this.prismaClient.rhRequest.count({ where }),
      ]);

      return {
        items,
        total,
        page: options.page,
        pageSize: options.limit,
        hasMore: options.page * options.limit < total,
      };
    } catch (err: unknown) {
      logError("Erro ao listar solicitações RH", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar solicitações. ${msg}`, err);
    }
  }

  async getById(id: string, organizationId: string): Promise<RhRequestSnapshot> {
    try {
      const requestId = assertNonEmptyString(id, "id");
      const orgId = assertNonEmptyString(organizationId, "organization_id");

      const found = await this.prismaClient.rhRequest.findFirst({
        where: { id: requestId, organization_id: orgId },
        select: REQUEST_SELECT,
      });

      if (!found) {
        throw new ServiceError(404, "Solicitação não encontrada.");
      }

      return found;
    } catch (err: unknown) {
      logError("Erro ao buscar solicitação RH", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao buscar solicitação. ${msg}`, err);
    }
  }

  async markOpened(input: {
    organization_id: string;
    request_id: string;
    user_id: string;
  }): Promise<void> {
    const requestId = assertNonEmptyString(input.request_id, "request_id");
    const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
    const userId = assertNonEmptyString(input.user_id, "user_id");
    if (this.prismaClient.rhRequestRead) {
      await this.prismaClient.rhRequestRead.upsert({
        where: {
          organization_id_request_id_user_id: {
            organization_id: organizationId,
            request_id: requestId,
            user_id: userId,
          },
        },
        create: {
          organization_id: organizationId,
          request_id: requestId,
          user_id: userId,
        },
        update: { read_at: new Date() },
      });
    }

    await this.rhNotificationService.markRead({
      organization_id: organizationId,
      user_id: userId,
      request_id: requestId,
    });
  }

  async delete(input: RequestDeleteInput): Promise<{ message: string }> {
    try {
      const id = assertNonEmptyString(input.id, "id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");

      const existing = await this.prismaClient.rhRequest.findFirst({
        where: { id, organization_id: organizationId },
        select: { id: true },
      });

      if (!existing) {
        throw new ServiceError(404, "Solicitação não encontrada.");
      }

      await this.prismaClient.rhRequest.deleteMany({
        where: { id, organization_id: organizationId },
      });

      return { message: "Solicitação removida com sucesso" };
    } catch (err: unknown) {
      logError("Erro ao excluir solicitação RH", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao excluir solicitação. ${msg}`, err);
    }
  }
}

export { RequestService };
