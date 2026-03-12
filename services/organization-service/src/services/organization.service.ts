import type { Request, Response } from "express";
import { createSuccessResponse, ServiceError } from "@workspace/shared";
import { type status } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

class OrganizationService {
  async create(request: Request, response: Response) {
    try {
      const { name, email_created_by, cnpj } = request.body;

      const slug = generateSlug(name);

      const slugExists = await prismaClient.organization.findUnique({
        where: { slug },
      });

      if (slugExists) {
        throw new ServiceError(409, "Já existe uma organização com esse nome/slug.");
      }

      const organization = await prismaClient.organization.create({
        data: {
          name,
          slug,
          email_created_by,
          cnpj,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          subscription_plan: true,
          logo_url: true,
          cnpj: true,
          email_created_by: true,
          created_at: true,
        },
      });

      response.status(201).json(createSuccessResponse(organization));
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao criar organização.");
    }
  }

  async findByCnpj(request: Request, response: Response) {
    try {
      const { cnpj } = request.params;

      if (!cnpj?.trim()) {
        throw new ServiceError(400, "cnpj é obrigatório.");
      }

      const organization = await prismaClient.organization.findFirst({
        where: { cnpj },
        select: {
          id: true,
          name: true,
          slug: true,
          logo_url: true,
          status: true,
          subscription_plan: true,
          email_created_by: true,
          cnpj: true,
          created_at: true,
          updated_at: true,
        },
      });

      if (!organization) {
        throw new ServiceError(404, "Organização não encontrada.");
      }

      response.json(createSuccessResponse(organization));
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao buscar organização.");
    }
  }

  async updateStatus(request: Request, response: Response) {
    try {
      const { cnpj } = request.params;
      const { status } = request.body as { status: status };

      if (!cnpj?.trim()) {
        throw new ServiceError(400, "cnpj é obrigatório.");
      }

      const organization = await prismaClient.organization.findFirst({
        where: { cnpj },
      });

      if (!organization) {
        throw new ServiceError(404, "Organização não encontrada.");
      }

      const updated = await prismaClient.organization.update({
        where: { id: organization.id },
        data: { status },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          updated_at: true,
        },
      });

      response.json(createSuccessResponse(updated));
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao atualizar status.");
    }
  }

  async updateSubscriptionPlan(request: Request, response: Response) {
    try {
      const { cnpj } = request.params;
      const { subscription_plan } = request.body;

      if (!cnpj?.trim()) {
        throw new ServiceError(400, "cnpj é obrigatório.");
      }

      const organization = await prismaClient.organization.findFirst({
        where: { cnpj },
      });

      if (!organization) {
        throw new ServiceError(404, "Organização não encontrada.");
      }

      const updated = await prismaClient.organization.update({
        where: { id: organization.id },
        data: { subscription_plan },
        select: {
          id: true,
          name: true,
          slug: true,
          subscription_plan: true,
          updated_at: true,
        },
      });

      response.json(createSuccessResponse(updated));
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao atualizar plano de assinatura.");
    }
  }

  async updateLogoUrl(request: Request, response: Response) {
    try {
      const { cnpj } = request.params;
      const { logo_url } = request.body;

      if (!cnpj?.trim()) {
        throw new ServiceError(400, "cnpj é obrigatório.");
      }

      const organization = await prismaClient.organization.findFirst({
        where: { cnpj },
      });

      if (!organization) {
        throw new ServiceError(404, "Organização não encontrada.");
      }

      const updated = await prismaClient.organization.update({
        where: { id: organization.id },
        data: { logo_url },
        select: {
          id: true,
          name: true,
          slug: true,
          logo_url: true,
          updated_at: true,
        },
      });

      response.json(createSuccessResponse(updated));
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao atualizar logo.");
    }
  }
}

export { OrganizationService };
