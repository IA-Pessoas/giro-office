import { normalizeCnpj } from "./domain.js";
import { OrganizationWorkerError } from "./errors.js";
import type {
  OrganizationAuditEvent,
  OrganizationAuditRecorder,
  OrganizationPrismaClient,
  OrganizationStatus,
  SubscriptionPlan,
} from "./types.js";

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
};

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
};

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
};

const ORGANIZATION_STATUS_UPDATE_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  updated_at: true,
};

const ORGANIZATION_SUBSCRIPTION_UPDATE_SELECT = {
  id: true,
  name: true,
  slug: true,
  subscription_plan: true,
  updated_at: true,
};

const ORGANIZATION_LOGO_UPDATE_SELECT = {
  id: true,
  name: true,
  slug: true,
  logo_url: true,
  updated_at: true,
};

const DEFAULT_PESSOAL_GROUP = {
  name: "Sem Movimento",
  normalized_name: "sem movimento",
  policy: "NO_OBLIGATIONS",
  system_key: "NO_MOVEMENT",
};

const DEFAULT_PLATFORM_DEPARTMENTS = [
  { name: "Administração", color: "#6B7280", status: "active", solution: false },
  { name: "Contábil", color: "#3B82F6", status: "active", solution: true },
  { name: "Fiscal", color: "#10B981", status: "active", solution: true },
  { name: "Pessoal", color: "#F59E0B", status: "active", solution: true },
  { name: "Recursos Humanos", color: "#EC4899", status: "active", solution: false },
  { name: "Tecnologia", color: "#8B5CF6", status: "active", solution: false },
  { name: "Comercial", color: "#EF4444", status: "active", solution: false },
  { name: "Financeiro", color: "#14B8A6", status: "active", solution: false },
];

export interface OrganizationRow extends Record<string, unknown> {}

export interface ListOrganizationsParams {
  page: number;
  pageSize: number;
  status?: OrganizationStatus;
}

export interface ListPlatformOrganizationsParams extends ListOrganizationsParams {
  search?: string;
}

export interface OrganizationServiceOptions {
  prisma: OrganizationPrismaClient;
  recordAudit?: OrganizationAuditRecorder;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isUniqueConflict(error: unknown): boolean {
  return isPrismaCode(error, "P2002");
}

function isRecordNotFound(error: unknown): boolean {
  return isPrismaCode(error, "P2025");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class OrganizationService {
  private readonly recordAudit: OrganizationAuditRecorder;

  constructor(
    private readonly prisma: OrganizationPrismaClient,
    options: OrganizationServiceOptions,
  ) {
    this.recordAudit = options.recordAudit ?? (async () => {});
  }

  private async prepareCnpj(value: string): Promise<string> {
    const cnpj = normalizeCnpj(value);
    const formatted = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/u, "$1.$2.$3/$4-$5");
    const existing = await this.prisma.organization.findFirst({
      where: { cnpj: { in: [cnpj, formatted] } },
      select: { id: true },
    });
    if (existing) {
      throw new OrganizationWorkerError(409, "Já existe uma organização com esse CNPJ.");
    }
    return cnpj;
  }

  private async emitAudit(event: OrganizationAuditEvent): Promise<void> {
    try {
      await this.recordAudit(event);
    } catch {
      // Auditoria de domínio permanece best-effort, igual ao serviço Node.
    }
  }

  private async platformSnapshot(id: string): Promise<OrganizationRow> {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: PLATFORM_ORGANIZATION_SELECT,
    });
    if (!organization) {
      throw new OrganizationWorkerError(404, "Organização não encontrada.");
    }
    return organization;
  }

  private async commitPlatformUpdate(
    id: string,
    expectedUpdatedAt: string,
    data: Record<string, unknown>,
  ): Promise<OrganizationRow> {
    try {
      return await this.prisma.organization.update({
        where: { id, updated_at: new Date(expectedUpdatedAt) },
        data,
        select: PLATFORM_ORGANIZATION_SELECT,
      });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new OrganizationWorkerError(
          409,
          "A organização foi alterada por outra operação.",
          error,
        );
      }
      throw error;
    }
  }

  async list(params: ListOrganizationsParams) {
    try {
      const where = params.status === undefined ? {} : { status: params.status };
      const [organizations, total] = await Promise.all([
        this.prisma.organization.findMany({
          where,
          select: ORGANIZATION_SELECT,
          orderBy: { created_at: "desc" },
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
        }),
        this.prisma.organization.count({ where }),
      ]);
      return { organizations, total, page: params.page, pageSize: params.pageSize };
    } catch (error) {
      throw new OrganizationWorkerError(
        500,
        `Erro interno ao listar organizações. ${messageOf(error)}`,
        error,
      );
    }
  }

  async listPlatform(params: ListPlatformOrganizationsParams) {
    try {
      const search = params.search?.trim() ?? "";
      const where = {
        ...(params.status === undefined ? {} : { status: params.status }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } },
                { cnpj: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [organizations, total] = await Promise.all([
        this.prisma.organization.findMany({
          where,
          select: PLATFORM_ORGANIZATION_SELECT,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
        }),
        this.prisma.organization.count({ where }),
      ]);
      return { organizations, total, page: params.page, pageSize: params.pageSize };
    } catch (error) {
      throw new OrganizationWorkerError(
        500,
        `Erro interno ao listar organizações. ${messageOf(error)}`,
        error,
      );
    }
  }

  async create(data: { name: string; email_created_by: string; cnpj: string }) {
    try {
      const slug = generateSlug(data.name);
      const slugExists = await this.prisma.organization.findUnique({ where: { slug } });
      if (slugExists) {
        throw new OrganizationWorkerError(409, "Já existe uma organização com esse nome/slug.");
      }
      const cnpj = await this.prepareCnpj(data.cnpj);
      return await this.prisma.organization.create({
        data: {
          name: data.name,
          slug,
          email_created_by: data.email_created_by,
          cnpj,
          pessoalGroups: { create: DEFAULT_PESSOAL_GROUP },
        },
        select: ORGANIZATION_CREATE_SELECT,
      });
    } catch (error) {
      if (error instanceof OrganizationWorkerError) throw error;
      if (isUniqueConflict(error)) {
        throw new OrganizationWorkerError(
          409,
          "Já existe uma organização com esse nome/slug ou CNPJ.",
          error,
        );
      }
      throw new OrganizationWorkerError(
        500,
        `Erro interno ao criar organização. ${messageOf(error)}`,
        error,
      );
    }
  }

  async createPlatform(data: {
    name: string;
    cnpj: string;
    emailCreatedBy: string;
    actorPlatformUserId: string;
  }) {
    try {
      const cnpj = await this.prepareCnpj(data.cnpj);
      const organization = await this.prisma.organization.create({
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
      await this.emitAudit({
        actorPlatformUserId: data.actorPlatformUserId,
        organizationId: String(organization.id),
        action: "organization.created",
        changes: {
          status: { from: null, to: organization.status },
          subscription_plan: { from: null, to: organization.subscription_plan },
        },
      });
      return organization;
    } catch (error) {
      if (error instanceof OrganizationWorkerError) throw error;
      if (isUniqueConflict(error)) {
        throw new OrganizationWorkerError(
          409,
          "Já existe uma organização com esse nome/slug ou CNPJ.",
          error,
        );
      }
      throw new OrganizationWorkerError(500, "Erro interno ao criar organização.", error);
    }
  }

  async findById(id: string) {
    try {
      const organization = await this.prisma.organization.findUnique({
        where: { id },
        select: ORGANIZATION_SELECT,
      });
      if (!organization) throw new OrganizationWorkerError(404, "Organização não encontrada.");
      return organization;
    } catch (error) {
      if (error instanceof OrganizationWorkerError) throw error;
      throw new OrganizationWorkerError(
        500,
        `Erro interno ao buscar organização. ${messageOf(error)}`,
        error,
      );
    }
  }

  async findPlatformById(id: string) {
    return this.platformSnapshot(id);
  }

  async updateStatus(id: string, status: OrganizationStatus) {
    try {
      return await this.prisma.organization.update({
        where: { id },
        data: { status },
        select: ORGANIZATION_STATUS_UPDATE_SELECT,
      });
    } catch (error) {
      throw new OrganizationWorkerError(
        500,
        `Erro interno ao atualizar status. ${messageOf(error)}`,
        error,
      );
    }
  }

  async updateSubscriptionPlan(id: string, subscription_plan: string) {
    try {
      return await this.prisma.organization.update({
        where: { id },
        data: { subscription_plan },
        select: ORGANIZATION_SUBSCRIPTION_UPDATE_SELECT,
      });
    } catch (error) {
      throw new OrganizationWorkerError(
        500,
        `Erro interno ao atualizar plano de assinatura. ${messageOf(error)}`,
        error,
      );
    }
  }

  async updateLogoUrl(id: string, logo_url: string | null) {
    try {
      return await this.prisma.organization.update({
        where: { id },
        data: { logo_url },
        select: ORGANIZATION_LOGO_UPDATE_SELECT,
      });
    } catch (error) {
      throw new OrganizationWorkerError(
        500,
        `Erro interno ao atualizar logo. ${messageOf(error)}`,
        error,
      );
    }
  }

  async updatePlatformStatus(data: {
    id: string;
    status: OrganizationStatus;
    expectedUpdatedAt: string;
    actorPlatformUserId: string;
  }) {
    const before = await this.platformSnapshot(data.id);
    const updated = await this.commitPlatformUpdate(data.id, data.expectedUpdatedAt, {
      status: data.status,
    });
    await this.emitAudit({
      actorPlatformUserId: data.actorPlatformUserId,
      organizationId: data.id,
      action: "organization.status.updated",
      changes: { status: { from: before.status, to: updated.status } },
    });
    return updated;
  }

  async updatePlatformSubscriptionPlan(data: {
    id: string;
    subscriptionPlan: SubscriptionPlan;
    expectedUpdatedAt: string;
    actorPlatformUserId: string;
  }) {
    const before = await this.platformSnapshot(data.id);
    const updated = await this.commitPlatformUpdate(data.id, data.expectedUpdatedAt, {
      subscription_plan: data.subscriptionPlan,
    });
    await this.emitAudit({
      actorPlatformUserId: data.actorPlatformUserId,
      organizationId: data.id,
      action: "organization.subscription_plan.updated",
      changes: {
        subscription_plan: { from: before.subscription_plan, to: updated.subscription_plan },
      },
    });
    return updated;
  }

  async updatePlatformLogoUrl(data: {
    id: string;
    logoUrl: string | null;
    expectedUpdatedAt: string;
    actorPlatformUserId: string;
  }) {
    const before = await this.platformSnapshot(data.id);
    const updated = await this.commitPlatformUpdate(data.id, data.expectedUpdatedAt, {
      logo_url: data.logoUrl,
    });
    await this.emitAudit({
      actorPlatformUserId: data.actorPlatformUserId,
      organizationId: data.id,
      action: "organization.logo_url.updated",
      changes: { logo_url: { from: before.logo_url, to: updated.logo_url } },
    });
    return updated;
  }
}
