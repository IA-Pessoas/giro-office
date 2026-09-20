import { error as logError, ServiceError } from "@workspace/shared";
import { normalizeCnpj } from "../domain/cnpj.js";
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

interface CreatePlatformOrganizationInput {
  name: string;
  cnpj: string;
  emailCreatedBy: string;
  actorPlatformUserId: string;
}

interface UpdatePlatformOrganizationInput {
  id: string;
  expectedUpdatedAt: string;
  actorPlatformUserId: string;
}

interface UpdatePlatformStatusInput extends UpdatePlatformOrganizationInput {
  status: status;
}

interface UpdatePlatformSubscriptionPlanInput extends UpdatePlatformOrganizationInput {
  subscriptionPlan: "trial" | "pro" | "enterprise";
}

interface UpdatePlatformLogoUrlInput extends UpdatePlatformOrganizationInput {
  logoUrl: string | null;
}

export interface OrganizationDomainAuditEvent {
  actorPlatformUserId: string;
  organizationId: string;
  action:
    | "organization.created"
    | "organization.status.updated"
    | "organization.subscription_plan.updated"
    | "organization.logo_url.updated";
  changes: Record<string, { from: unknown; to: unknown }>;
}

export type OrganizationDomainAuditRecorder = (
  event: OrganizationDomainAuditEvent,
) => Promise<void>;

function isPrismaUniqueConflict(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

function isPrismaRecordNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2025";
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

const ACTIVE_DEPARTMENT_STATUS: status = "active";
const DEFAULT_PESSOAL_GROUP = {
  name: "Sem Movimento",
  normalized_name: "sem movimento",
  policy: "NO_OBLIGATIONS",
  system_key: "NO_MOVEMENT",
};

const DEFAULT_PLATFORM_DEPARTMENTS = [
  { name: "Administração", color: "#6B7280", status: ACTIVE_DEPARTMENT_STATUS, solution: false },
  { name: "Contábil", color: "#3B82F6", status: ACTIVE_DEPARTMENT_STATUS, solution: true },
  { name: "Fiscal", color: "#10B981", status: ACTIVE_DEPARTMENT_STATUS, solution: true },
  { name: "Pessoal", color: "#F59E0B", status: ACTIVE_DEPARTMENT_STATUS, solution: true },
  { name: "Recursos Humanos", color: "#EC4899", status: ACTIVE_DEPARTMENT_STATUS, solution: false },
  { name: "Tecnologia", color: "#8B5CF6", status: ACTIVE_DEPARTMENT_STATUS, solution: false },
  { name: "Comercial", color: "#EF4444", status: ACTIVE_DEPARTMENT_STATUS, solution: false },
  { name: "Financeiro", color: "#14B8A6", status: ACTIVE_DEPARTMENT_STATUS, solution: false },
];

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
  constructor(
    private readonly recordOrganizationAudit: OrganizationDomainAuditRecorder = async () => {},
  ) {}

  private async prepareCnpjForCreation(value: string): Promise<string> {
    const cnpj = normalizeCnpj(value);
    const formatted = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/u, "$1.$2.$3/$4-$5");
    const existing = await prismaClient.organization.findFirst({
      where: { cnpj: { in: [cnpj, formatted] } },
      select: { id: true },
    });
    if (existing) {
      throw new ServiceError(409, "Já existe uma organização com esse CNPJ.");
    }
    return cnpj;
  }

  private async emitOrganizationAudit(event: OrganizationDomainAuditEvent): Promise<void> {
    try {
      await this.recordOrganizationAudit(event);
    } catch (err: unknown) {
      logError("Erro ao registrar auditoria de organização após commit", { err });
    }
  }

  private async findPlatformSnapshot(id: string): Promise<PlatformOrganizationRow> {
    const organization = await prismaClient.organization.findUnique({
      where: { id },
      select: PLATFORM_ORGANIZATION_SELECT,
    });
    if (!organization) {
      throw new ServiceError(404, "Organização não encontrada.");
    }
    return organization;
  }

  private async commitPlatformUpdate(
    id: string,
    expectedUpdatedAt: string,
    data: Prisma.OrganizationUpdateInput,
  ): Promise<PlatformOrganizationRow> {
    try {
      return await prismaClient.organization.update({
        where: { id, updated_at: new Date(expectedUpdatedAt) },
        data,
        select: PLATFORM_ORGANIZATION_SELECT,
      });
    } catch (err: unknown) {
      if (isPrismaRecordNotFound(err)) {
        throw new ServiceError(409, "A organização foi alterada por outra operação.", err);
      }
      throw err;
    }
  }

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

  async createPlatform(data: CreatePlatformOrganizationInput): Promise<PlatformOrganizationRow> {
    try {
      const cnpj = await this.prepareCnpjForCreation(data.cnpj);
      const organization = await prismaClient.organization.create({
        data: {
          name: data.name,
          slug: generateSlug(data.name),
          email_created_by: data.emailCreatedBy,
          cnpj,
          status: "active",
          subscription_plan: "trial",
          departments: { create: DEFAULT_PLATFORM_DEPARTMENTS },
          pessoalGroups: { create: DEFAULT_PESSOAL_GROUP },
        },
        select: PLATFORM_ORGANIZATION_SELECT,
      });

      await this.emitOrganizationAudit({
        actorPlatformUserId: data.actorPlatformUserId,
        organizationId: organization.id,
        action: "organization.created",
        changes: {
          status: { from: null, to: organization.status },
          subscription_plan: { from: null, to: organization.subscription_plan },
        },
      });
      return organization;
    } catch (err: unknown) {
      logError("Erro ao criar organização pela plataforma", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueConflict(err)) {
        throw new ServiceError(409, "Já existe uma organização com esse nome/slug ou CNPJ.", err);
      }
      throw new ServiceError(500, "Erro interno ao criar organização.", err);
    }
  }

  async findPlatformById(id: string): Promise<PlatformOrganizationRow> {
    try {
      return await this.findPlatformSnapshot(id);
    } catch (err: unknown) {
      logError("Erro ao buscar organização pela plataforma", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao buscar organização.", err);
    }
  }

  async updatePlatformStatus(data: UpdatePlatformStatusInput): Promise<PlatformOrganizationRow> {
    try {
      const before = await this.findPlatformSnapshot(data.id);
      const updated = await this.commitPlatformUpdate(data.id, data.expectedUpdatedAt, {
        status: data.status,
      });
      await this.emitOrganizationAudit({
        actorPlatformUserId: data.actorPlatformUserId,
        organizationId: data.id,
        action: "organization.status.updated",
        changes: { status: { from: before.status, to: updated.status } },
      });
      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar status da organização pela plataforma", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao atualizar status.", err);
    }
  }

  async updatePlatformSubscriptionPlan(
    data: UpdatePlatformSubscriptionPlanInput,
  ): Promise<PlatformOrganizationRow> {
    try {
      const before = await this.findPlatformSnapshot(data.id);
      const updated = await this.commitPlatformUpdate(data.id, data.expectedUpdatedAt, {
        subscription_plan: data.subscriptionPlan,
      });
      await this.emitOrganizationAudit({
        actorPlatformUserId: data.actorPlatformUserId,
        organizationId: data.id,
        action: "organization.subscription_plan.updated",
        changes: {
          subscription_plan: {
            from: before.subscription_plan,
            to: updated.subscription_plan,
          },
        },
      });
      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar plano da organização pela plataforma", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao atualizar plano de assinatura.", err);
    }
  }

  async updatePlatformLogoUrl(data: UpdatePlatformLogoUrlInput): Promise<PlatformOrganizationRow> {
    try {
      const before = await this.findPlatformSnapshot(data.id);
      const updated = await this.commitPlatformUpdate(data.id, data.expectedUpdatedAt, {
        logo_url: data.logoUrl,
      });
      await this.emitOrganizationAudit({
        actorPlatformUserId: data.actorPlatformUserId,
        organizationId: data.id,
        action: "organization.logo_url.updated",
        changes: { logo_url: { from: before.logo_url, to: updated.logo_url } },
      });
      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar logo da organização pela plataforma", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao atualizar logo.", err);
    }
  }

  async create(data: CreateOrganizationInput): Promise<OrganizationCreatedRow> {
    try {
      const { name, email_created_by } = data;
      const slug = generateSlug(name);

      const slugExists = await prismaClient.organization.findUnique({
        where: { slug },
      });

      if (slugExists) {
        throw new ServiceError(409, "Já existe uma organização com esse nome/slug.");
      }

      const cnpj = await this.prepareCnpjForCreation(data.cnpj);
      const organization = await prismaClient.organization.create({
        data: {
          name,
          slug,
          email_created_by,
          cnpj,
          pessoalGroups: { create: DEFAULT_PESSOAL_GROUP },
        },
        select: ORGANIZATION_CREATE_SELECT,
      });

      return organization;
    } catch (err: unknown) {
      logError("Erro ao criar organização", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueConflict(err)) {
        throw new ServiceError(409, "Já existe uma organização com esse nome/slug ou CNPJ.", err);
      }
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
