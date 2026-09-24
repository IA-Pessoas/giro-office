import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import { TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  AssignTiRequestBody,
  CreateTiRequestBody,
  ListTiRequestsQuery,
  UpdateTiRequestBody,
  UpdateTiRequestStatusBody,
} from "../schemas/tiRequest.schemas.js";
import { TiDepartmentResolverService } from "./tiDepartmentResolverService.js";

export interface TiAuthContext {
  organizationId: string;
  userId: string;
  permission: number;
  isOrganizationOwner?: boolean;
}

const allowedTransitions = new Map<string, string[]>([
  ["New", ["In_Progress", "Waiting", "Resolved", "Closed"]],
  ["In_Progress", ["Waiting", "Resolved", "Closed"]],
  ["Waiting", ["In_Progress", "Resolved", "Closed"]],
  ["Resolved", ["Closed"]],
  ["Closed", []],
]);

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  full_name: true,
  department_id: true,
  organization_id: true,
} as const;

const TRANSFER_CANDIDATE_SELECT = {
  id: true,
  name: true,
  full_name: true,
  department_id: true,
} as const;

export class TiRequestService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(context: TiAuthContext, query: ListTiRequestsQuery): Promise<unknown[]> {
    const { skip, take } = getPaginationParams(query);
    const requesterId =
      context.permission < TiPermissionLevel.Technician ? context.userId : query.requester_id;

    return this.prisma.tIRequest.findMany({
      where: {
        organization_id: context.organizationId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.urgency ? { urgency: query.urgency } : {}),
        ...(query.category_id ? { category_id: query.category_id } : {}),
        ...(requesterId ? { requester_id: requesterId } : {}),
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
      include: {
        category: true,
        requester: {
          select: SAFE_USER_SELECT,
        },
        assigned_to: {
          select: SAFE_USER_SELECT,
        },
      },
      orderBy: { created_at: "desc" },
      skip,
      take,
    });
  }

  async getById(context: TiAuthContext, id: string): Promise<unknown> {
    const request = await this.prisma.tIRequest.findFirst({
      where: { id, organization_id: context.organizationId },
      include: {
        category: true,
        requester: {
          select: SAFE_USER_SELECT,
        },
        assigned_to: {
          select: SAFE_USER_SELECT,
        },
      },
    });

    if (!request) {
      throw new ServiceError(404, "Chamado de TI nao encontrado.");
    }

    if (
      context.permission < TiPermissionLevel.Technician &&
      request.requester_id !== context.userId
    ) {
      throw new ServiceError(404, "Chamado de TI nao encontrado.");
    }

    return request;
  }

  async create(context: TiAuthContext, body: CreateTiRequestBody): Promise<unknown> {
    try {
      const requesterId = body.requester_id ?? context.userId;

      if (requesterId !== context.userId && context.permission < TiPermissionLevel.Technician) {
        throw new ServiceError(
          403,
          "Permissao insuficiente para criar chamado para outro usuario.",
        );
      }

      if (body.assigned_to_id && context.permission < TiPermissionLevel.Admin) {
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
          anydesk_code: body.anydesk_code,
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
    const request = await this.prisma.tIRequest.findFirst({
      where: { id, organization_id: context.organizationId },
      select: { assigned_to_id: true },
    });

    if (!request) {
      throw new ServiceError(404, "Chamado de TI nao encontrado.");
    }

    this.assertTransferorPermission(context, request.assigned_to_id);

    const destination = await this.ensureUser(
      context.organizationId,
      body.assigned_to_id,
      "Responsavel nao encontrado.",
    );
    const technologyDepartmentId = await new TiDepartmentResolverService(
      this.prisma,
    ).resolveTechnologyDepartmentId(context.organizationId);

    if (destination.status !== "active" || destination.department_id !== technologyDepartmentId) {
      throw new ServiceError(400, "Responsavel deve pertencer ao departamento Tecnologia.");
    }

    const updateResult = await this.prisma.tIRequest.updateMany({
      where: {
        id,
        organization_id: context.organizationId,
        ...(request.assigned_to_id === context.userId &&
        context.permission < TiPermissionLevel.Admin &&
        !context.isOrganizationOwner
          ? { assigned_to_id: request.assigned_to_id }
          : {}),
      },
      data: { assigned_to_id: body.assigned_to_id },
    });

    if (updateResult.count === 0) {
      throw new ServiceError(409, "Chamado de TI foi transferido por outro usuario.");
    }

    return { id, assigned_to_id: body.assigned_to_id };
  }

  async listTransferCandidates(
    context: TiAuthContext,
    id: string,
  ): Promise<
    Array<{ id: string; name: string | null; full_name: string | null; department_id: string }>
  > {
    const request = await this.prisma.tIRequest.findFirst({
      where: { id, organization_id: context.organizationId },
      select: { assigned_to_id: true },
    });

    if (!request) {
      throw new ServiceError(404, "Chamado de TI nao encontrado.");
    }

    this.assertTransferorPermission(context, request.assigned_to_id);

    const technologyDepartmentId = await new TiDepartmentResolverService(
      this.prisma,
    ).resolveTechnologyDepartmentId(context.organizationId);

    return this.prisma.user.findMany({
      where: {
        organization_id: context.organizationId,
        department_id: technologyDepartmentId,
        status: "active",
        permissions: {
          some: {
            organization_id: context.organizationId,
            ti: { gte: TiPermissionLevel.Requester },
          },
        },
      },
      select: TRANSFER_CANDIDATE_SELECT,
      orderBy: { full_name: "asc" },
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

      if (!allowed.includes(body.status) && context.permission < TiPermissionLevel.Admin) {
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

  private assertTransferorPermission(context: TiAuthContext, assignedToId: string | null): void {
    if (
      assignedToId !== context.userId &&
      context.permission < TiPermissionLevel.Admin &&
      !context.isOrganizationOwner
    ) {
      throw new ServiceError(403, "Permissao insuficiente para transferir chamado.");
    }
  }

  private async ensureUser(
    organizationId: string,
    userId: string,
    message: string,
  ): Promise<{ status: string; department_id: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organization_id: organizationId },
    });

    if (!user) {
      throw new ServiceError(404, message);
    }

    return user;
  }
}
