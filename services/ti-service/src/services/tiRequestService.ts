import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  AssignTiRequestBody,
  CreateTiRequestBody,
  ListTiRequestsQuery,
  UpdateTiRequestBody,
  UpdateTiRequestStatusBody,
} from "../schemas/tiRequest.schemas.js";

export interface TiAuthContext {
  organizationId: string;
  userId: string;
  permission: number;
}

const allowedTransitions = new Map<string, string[]>([
  ["New", ["In_Progress", "Waiting", "Resolved", "Closed"]],
  ["In_Progress", ["Waiting", "Resolved", "Closed"]],
  ["Waiting", ["In_Progress", "Resolved", "Closed"]],
  ["Resolved", ["Closed", "In_Progress"]],
  ["Closed", []],
]);

export class TiRequestService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(context: TiAuthContext, query: ListTiRequestsQuery): Promise<unknown[]> {
    const { skip, take } = getPaginationParams(query);

    return this.prisma.tIRequest.findMany({
      where: {
        organization_id: context.organizationId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.urgency ? { urgency: query.urgency } : {}),
        ...(query.category_id ? { category_id: query.category_id } : {}),
        ...(query.requester_id ? { requester_id: query.requester_id } : {}),
        ...(query.assigned_to_id ? { assigned_to_id: query.assigned_to_id } : {}),
        ...(query.created_from || query.created_to
          ? {
              created_at: {
                ...(query.created_from ? { gte: query.created_from } : {}),
                ...(query.created_to ? { lte: query.created_to } : {}),
              },
            }
          : {}),
      },
      orderBy: { created_at: "desc" },
      skip,
      take,
    });
  }

  async getById(context: TiAuthContext, id: string): Promise<unknown> {
    const request = await this.prisma.tIRequest.findFirst({
      where: { id, organization_id: context.organizationId },
      include: { category: true, requester: true, assigned_to: true },
    });

    if (!request) {
      throw new ServiceError(404, "Chamado de TI nao encontrado.");
    }

    return request;
  }

  async create(context: TiAuthContext, body: CreateTiRequestBody): Promise<unknown> {
    try {
      const requesterId = body.requester_id ?? context.userId;

      if (requesterId !== context.userId && context.permission < 3) {
        throw new ServiceError(
          403,
          "Permissao insuficiente para criar chamado para outro usuario.",
        );
      }

      if (body.assigned_to_id && context.permission < 3) {
        throw new ServiceError(403, "Permissao insuficiente para atribuir chamado.");
      }

      await this.ensureCategory(context.organizationId, body.category_id);
      await this.ensureUser(context.organizationId, requesterId, "Solicitante nao encontrado.");

      if (body.assigned_to_id) {
        await this.ensureUser(
          context.organizationId,
          body.assigned_to_id,
          "Responsavel nao encontrado.",
        );
      }

      return this.prisma.tIRequest.create({
        data: {
          title: body.title,
          description: body.description,
          category_id: body.category_id,
          requester_id: requesterId,
          assigned_to_id: body.assigned_to_id,
          urgency: body.urgency,
          attachment: body.attachment,
          status: "New",
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar chamado de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar chamado de TI.", err);
    }
  }

  async update(context: TiAuthContext, id: string, body: UpdateTiRequestBody): Promise<unknown> {
    await this.getById(context, id);

    if (body.category_id) {
      await this.ensureCategory(context.organizationId, body.category_id);
    }

    return this.prisma.tIRequest.update({ where: { id }, data: body });
  }

  async assign(context: TiAuthContext, id: string, body: AssignTiRequestBody): Promise<unknown> {
    if (context.permission < 3) {
      throw new ServiceError(403, "Permissao insuficiente para atribuir chamado.");
    }

    await this.getById(context, id);
    await this.ensureUser(
      context.organizationId,
      body.assigned_to_id,
      "Responsavel nao encontrado.",
    );

    return this.prisma.tIRequest.update({
      where: { id },
      data: { assigned_to_id: body.assigned_to_id },
    });
  }

  async updateStatus(
    context: TiAuthContext,
    id: string,
    body: UpdateTiRequestStatusBody,
  ): Promise<unknown> {
    const request = (await this.getById(context, id)) as { status: string };

    if (request.status !== body.status) {
      const allowed = allowedTransitions.get(request.status) ?? [];

      if (!allowed.includes(body.status) && context.permission < 3) {
        throw new ServiceError(403, "Permissao insuficiente para esta transicao.");
      }
    }

    return this.prisma.tIRequest.update({ where: { id }, data: { status: body.status } });
  }

  private async ensureCategory(organizationId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.tICategoryRequest.findFirst({
      where: { id: categoryId, organization_id: organizationId, active: true },
    });

    if (!category) {
      throw new ServiceError(404, "Categoria de TI nao encontrada.");
    }
  }

  private async ensureUser(organizationId: string, userId: string, message: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organization_id: organizationId },
    });

    if (!user) {
      throw new ServiceError(404, message);
    }
  }
}
