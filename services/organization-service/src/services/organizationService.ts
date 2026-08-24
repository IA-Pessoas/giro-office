import { error as logError, ServiceError } from "@workspace/shared";
import type { Prisma, status } from "../generated/prisma/client.js";
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

interface CreateOrganizationInput {
  name: string;
  email_created_by: string;
  cnpj: string;
}

export interface ListOrganizationsParams {
  page: number;
  pageSize: number;
  status?: status;
}

export interface ListPlatformOrganizationsParams extends ListOrganizationsParams {
  search?: string;
}

const ORGANIZATION_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  subscription_plan: true,
  logo_url: true,
  cnpj: true,
  email_created_by: true,
  created_at: true,
  updated_at: true,
} as const;

const PLATFORM_ORGANIZATION_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  subscription_plan: true,
  logo_url: true,
  cnpj: true,
  created_at: true,
  updated_at: true,
} as const;

const ORGANIZATION_CREATE_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  subscription_plan: true,
  logo_url: true,
  cnpj: true,
  email_created_by: true,
  created_at: true,
} as const;

const ORGANIZATION_STATUS_UPDATE_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  updated_at: true,
} as const;

const ORGANIZATION_SUBSCRIPTION_UPDATE_SELECT = {
  id: true,
  name: true,
  slug: true,
  subscription_plan: true,
  updated_at: true,
} as const;

const ORGANIZATION_LOGO_UPDATE_SELECT = {
  id: true,
  name: true,
  slug: true,
  logo_url: true,
  updated_at: true,
} as const;

export type OrganizationRow = Prisma.OrganizationGetPayload<{ select: typeof ORGANIZATION_SELECT }>;
export type PlatformOrganizationRow = Prisma.OrganizationGetPayload<{
  select: typeof PLATFORM_ORGANIZATION_SELECT;
}>;
export type OrganizationCreatedRow = Prisma.OrganizationGetPayload<{
  select: typeof ORGANIZATION_CREATE_SELECT;
}>;
export type OrganizationStatusUpdatedRow = Prisma.OrganizationGetPayload<{
  select: typeof ORGANIZATION_STATUS_UPDATE_SELECT;
}>;
export type OrganizationSubscriptionUpdatedRow = Prisma.OrganizationGetPayload<{
  select: typeof ORGANIZATION_SUBSCRIPTION_UPDATE_SELECT;
}>;
export type OrganizationLogoUpdatedRow = Prisma.OrganizationGetPayload<{
  select: typeof ORGANIZATION_LOGO_UPDATE_SELECT;
}>;

class OrganizationService {
  async list(params: ListOrganizationsParams): Promise<{
    organizations: OrganizationRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    try {
      const { page, pageSize, status: statusFilter } = params;
      const where = statusFilter !== undefined ? { status: statusFilter } : {};

      const [organizations, total] = await Promise.all([
        prismaClient.organization.findMany({
          where,
          select: ORGANIZATION_SELECT,
          orderBy: { created_at: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prismaClient.organization.count({ where }),
      ]);

      return { organizations, total, page, pageSize };
    } catch (err: unknown) {
      logError("Erro ao listar organizações", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar organizações. ${msg}`, err);
    }
  }

  async listPlatform(params: ListPlatformOrganizationsParams): Promise<{
    organizations: PlatformOrganizationRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    try {
      const { page, pageSize, status: statusFilter, search = "" } = params;
      const normalizedSearch = search.trim();
      const where: Prisma.OrganizationWhereInput = {
        ...(statusFilter !== undefined ? { status: statusFilter } : {}),
        ...(normalizedSearch
          ? {
              OR: [
                { name: { contains: normalizedSearch, mode: "insensitive" } },
                { slug: { contains: normalizedSearch, mode: "insensitive" } },
                { cnpj: { contains: normalizedSearch, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const [organizations, total] = await Promise.all([
        prismaClient.organization.findMany({
          where,
          select: PLATFORM_ORGANIZATION_SELECT,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prismaClient.organization.count({ where }),
      ]);

      return { organizations, total, page, pageSize };
    } catch (err: unknown) {
      logError("Erro ao listar organizações pela plataforma", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar organizações. ${msg}`, err);
    }
  }

  async create(data: CreateOrganizationInput) {
    try {
      const { name, email_created_by, cnpj } = data;
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
        select: ORGANIZATION_CREATE_SELECT,
      });

      return organization;
    } catch (err: unknown) {
      logError("Erro ao criar organização", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao criar organização. ${msg}`, err);
    }
  }

  async findById(id: string): Promise<OrganizationRow> {
    try {
      const organization = await prismaClient.organization.findUnique({
        where: { id },
        select: ORGANIZATION_SELECT,
      });

      if (!organization) {
        throw new ServiceError(404, "Organização não encontrada.");
      }

      return organization;
    } catch (err: unknown) {
      logError("Erro ao buscar organização", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao buscar organização. ${msg}`, err);
    }
  }

  async updateStatus(id: string, statusValue: status) {
    try {
      const updated = await prismaClient.organization.update({
        where: { id },
        data: { status: statusValue },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          updated_at: true,
        },
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar status da organização", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao atualizar status. ${msg}`, err);
    }
  }

  async updateSubscriptionPlan(
    id: string,
    subscription_plan: string,
  ): Promise<OrganizationSubscriptionUpdatedRow> {
    try {
      const updated = await prismaClient.organization.update({
        where: { id },
        data: { subscription_plan },
        select: ORGANIZATION_SUBSCRIPTION_UPDATE_SELECT,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar plano de assinatura", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao atualizar plano de assinatura. ${msg}`, err);
    }
  }

  async updateLogoUrl(id: string, logo_url: string | null) {
    try {
      const updated = await prismaClient.organization.update({
        where: { id },
        data: { logo_url },
        select: ORGANIZATION_LOGO_UPDATE_SELECT,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar logo da organização", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao atualizar logo. ${msg}`, err);
    }
  }
}

export { OrganizationService };
