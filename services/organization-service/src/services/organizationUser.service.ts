import type { Request, Response } from "express";
import { createSuccessResponse } from "@workspace/shared";
import { type enumType } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

class OrganizationUserService {
  async create(request: Request, response: Response) {
    try {
      const { organization_id, user_id, type, first_owner_flag } = request.body;

      if (first_owner_flag === true && type !== "owner") {
        throw new Error(
          "first_owner_flag só pode ser true quando type for owner.",
        );
      }

      const exists = await prismaClient.organizationUser.findFirst({
        where: { organization_id, user_id },
      });

      if (exists) {
        throw new Error("Usuário já vinculado a esta organização.");
      }

      const organizationUser = await prismaClient.organizationUser.create({
        data: {
          organization_id,
          user_id,
          type,
          first_owner_flag,
        },
        select: {
          id: true,
          organization_id: true,
          user_id: true,
          type: true,
          first_owner_flag: true,
        },
      });

      response.status(201).json(createSuccessResponse(organizationUser));
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Erro interno ao criar vínculo de usuário na organização.");
    }
  }

  async findByOrganization(request: Request, response: Response) {
    try {
      const { organization_id } = request.params;
      const { type, first_owner_flag } = request.query;

      const where: Record<string, unknown> = { organization_id };

      if (type) {
        where.type = type as enumType;
      }

      if (first_owner_flag !== undefined) {
        where.first_owner_flag = first_owner_flag === "true";
      }

      const organizationUsers = await prismaClient.organizationUser.findMany({
        where,
        select: {
          id: true,
          organization_id: true,
          user_id: true,
          type: true,
          first_owner_flag: true,
        },
      });

      response.json(createSuccessResponse(organizationUsers));
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Erro interno ao buscar usuários da organização.");
    }
  }

  async findByUser(request: Request, response: Response) {
    try {
      const { user_id } = request.params;
      const { type, first_owner_flag } = request.query;

      const where: Record<string, unknown> = { user_id };

      if (type) {
        where.type = type as enumType;
      }

      if (first_owner_flag !== undefined) {
        where.first_owner_flag = first_owner_flag === "true";
      }

      const organizationUsers = await prismaClient.organizationUser.findMany({
        where,
        select: {
          id: true,
          organization_id: true,
          user_id: true,
          type: true,
          first_owner_flag: true,
        },
      });

      response.json(createSuccessResponse(organizationUsers));
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Erro interno ao buscar organizações do usuário.");
    }
  }

  async findById(request: Request, response: Response) {
    try {
      const { id } = request.params;

      const organizationUser = await prismaClient.organizationUser.findUnique({
        where: { id },
        select: {
          id: true,
          organization_id: true,
          user_id: true,
          type: true,
          first_owner_flag: true,
        },
      });

      if (!organizationUser) {
        throw new Error("Vínculo de usuário na organização não encontrado.");
      }

      response.json(createSuccessResponse(organizationUser));
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Erro interno ao buscar vínculo de usuário na organização.");
    }
  }

  async update(request: Request, response: Response) {
    try {
      const { id } = request.params;
      const { type, first_owner_flag } = request.body as {
        type?: enumType;
        first_owner_flag?: boolean;
      };

      const organizationUser = await prismaClient.organizationUser.findUnique({
        where: { id },
      });

      if (!organizationUser) {
        throw new Error("Vínculo de usuário na organização não encontrado.");
      }

      const effectiveType = type ?? organizationUser.type;
      const effectiveFirstOwnerFlag =
        first_owner_flag ?? organizationUser.first_owner_flag ?? false;
      if (effectiveFirstOwnerFlag === true && effectiveType !== "owner") {
        throw new Error(
          "first_owner_flag só pode ser true quando type for owner.",
        );
      }

      const data: Record<string, unknown> = {};
      if (type !== undefined) data.type = type;
      if (first_owner_flag !== undefined) data.first_owner_flag = first_owner_flag;

      const updated = await prismaClient.organizationUser.update({
        where: { id },
        data,
        select: {
          id: true,
          organization_id: true,
          user_id: true,
          type: true,
          first_owner_flag: true,
        },
      });

      response.json(createSuccessResponse(updated));
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Erro interno ao atualizar vínculo de usuário na organização.");
    }
  }
}

export { OrganizationUserService };
