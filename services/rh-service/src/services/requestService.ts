import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

const REQUEST_SELECT = {
  id: true,
  title: true,
  description: true,
  requester_user_id: true,
  category_id: true,
  assigned_to_user_id: true,
  urgency: true,
  status: true,
  created_at: true,
  updated_at: true,
  organization_id: true,
} as const;

export type RhRequestSnapshot = Prisma.RhRequestGetPayload<{
  select: typeof REQUEST_SELECT;
}>;

export interface RequestCreateInput {
  organization_id: string;
  requester_user_id: string;
  title: string;
  description: string;
  category_id: string;
  assigned_to_user_id: string;
  urgency: "Low" | "Medium" | "High";
}

export interface RequestUpdateInput {
  id: string;
  organization_id: string;
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
  status?: "New" | "In_Progress" | "Resolved" | "Closed";
  category_id?: string;
  requester_user_id?: string;
  assigned_to_user_id?: string;
}

class RequestService {
  private ensureAssigneeIsNotRequester(requesterUserId: string, assignedToUserId: string): void {
    if (requesterUserId === assignedToUserId) {
      throw new ServiceError(
        400,
        "O responsável pela solicitação não pode ser o mesmo usuário que a abriu.",
      );
    }
  }

  private async requireCategoryInOrg(organizationId: string, categoryId: string): Promise<void> {
    const category = await prismaClient.rhCategory.findFirst({
      where: { id: categoryId, organization_id: organizationId },
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
      const assignedToUserId = assertNonEmptyString(
        input.assigned_to_user_id,
        "assigned_to_user_id",
      );

      await this.requireCategoryInOrg(organizationId, categoryId);
      this.ensureAssigneeIsNotRequester(requesterUserId, assignedToUserId);

      const created = await prismaClient.rhRequest.create({
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

      const existing = await prismaClient.rhRequest.findFirst({
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
        data.assigned_to_user_id = assertNonEmptyString(
          input.assigned_to_user_id,
          "assigned_to_user_id",
        );
      }
      if (input.urgency !== undefined) {
        data.urgency = input.urgency;
      }
      if (input.status !== undefined) {
        data.status = input.status;
      }

      const assigneeAfterUpdate = data.assigned_to_user_id ?? existing.assigned_to_user_id;
      this.ensureAssigneeIsNotRequester(existing.requester_user_id, assigneeAfterUpdate);

      const updated = await prismaClient.rhRequest.update({
        where: { id },
        data,
        select: REQUEST_SELECT,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar solicitação RH", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao atualizar solicitação. ${msg}`, err);
    }
  }

  async list(
    organizationId: string,
    options: RequestListOptions = {},
  ): Promise<RhRequestSnapshot[]> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");

      return await prismaClient.rhRequest.findMany({
        where: {
          organization_id: orgId,
          ...(options.status !== undefined ? { status: options.status } : {}),
          ...(options.category_id !== undefined ? { category_id: options.category_id } : {}),
          ...(options.requester_user_id !== undefined
            ? { requester_user_id: options.requester_user_id }
            : {}),
          ...(options.assigned_to_user_id !== undefined
            ? { assigned_to_user_id: options.assigned_to_user_id }
            : {}),
        },
        orderBy: { created_at: "desc" },
        select: REQUEST_SELECT,
      });
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

      const found = await prismaClient.rhRequest.findFirst({
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

  async delete(input: RequestDeleteInput): Promise<{ message: string }> {
    try {
      const id = assertNonEmptyString(input.id, "id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");

      const existing = await prismaClient.rhRequest.findFirst({
        where: { id, organization_id: organizationId },
        select: { id: true },
      });

      if (!existing) {
        throw new ServiceError(404, "Solicitação não encontrada.");
      }

      await prismaClient.rhRequest.deleteMany({
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
