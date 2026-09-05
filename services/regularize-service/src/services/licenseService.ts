import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLicenseBody, UpdateLicenseBody } from "../schemas/license.schemas.js";
import { RegularizeLogService } from "./regularizeLogService.js";
import type { RegularizeReconciliationService } from "./regularizeReconciliationService.js";
import { ensureRegularizeResponsible } from "./regularizeResponsibleService.js";

const licenseSelect = {
  id: true,
  client_id: true,
  has: true,
  type_license: true,
  entry_date: true,
  protocol: true,
  responsible_id: true,
  status: true,
  date_last_consultation: true,
  current_situation: true,
  contact: true,
  observation: true,
  urgency: true,
  type: true,
  due_date: true,
  task_id: true,
} as const;

export class LicenseService {
  readonly #logs: RegularizeLogService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly reconciliationService: RegularizeReconciliationService,
  ) {
    this.#logs = new RegularizeLogService(prisma);
  }

  async create(input: {
    organizationId: string;
    userId: string;
    body: CreateLicenseBody;
  }): Promise<Record<string, unknown>> {
    if (input.body.client_id) {
      await this.ensureClientExists(input.organizationId, input.body.client_id);
    }
    await ensureRegularizeResponsible(this.prisma, input.organizationId, input.body.responsible_id);

    const exists = await this.prisma.license.findFirst({
      where: {
        organization_id: input.organizationId,
        protocol: input.body.protocol,
        client_id: input.body.client_id ?? null,
      },
      select: { id: true },
    });
    if (exists) {
      throw new ServiceError(409, "Alvara com este protocolo ja cadastrado.");
    }

    const created = await this.prisma.license.create({
      data: {
        ...input.body,
        observation: input.body.observation ?? null,
        organization_id: input.organizationId,
      },
      select: licenseSelect,
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Cadastro",
      referring: "regularize.license",
      referringId: created.id,
      changes: "{}",
    });

    await this.reconciliationService.handleLicenseChanged(input.organizationId, created.id);

    return created as unknown as Record<string, unknown>;
  }

  async update(input: {
    organizationId: string;
    userId: string;
    body: UpdateLicenseBody;
  }): Promise<Record<string, unknown>> {
    const existing = await this.prisma.license.findFirst({
      where: { id: input.body.id, organization_id: input.organizationId },
      select: licenseSelect,
    });
    if (!existing) {
      throw new ServiceError(404, "Alvara nao encontrado.");
    }

    if (input.body.client_id) {
      await this.ensureClientExists(input.organizationId, input.body.client_id);
    }
    await ensureRegularizeResponsible(
      this.prisma,
      input.organizationId,
      input.body.responsible_id,
      existing.responsible_id,
    );

    const updated = await this.prisma.license.update({
      where: { id: input.body.id },
      data: {
        ...input.body,
        observation: input.body.observation ?? null,
      },
      select: licenseSelect,
    });

    await this.#logs.logUpdateIfChanged({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Atualizacao",
      referring: "regularize.license",
      referringId: existing.id,
      oldData: existing as unknown as Record<string, unknown>,
      updatedData: updated as unknown as Record<string, unknown>,
    });

    await this.reconciliationService.handleLicenseChanged(input.organizationId, updated.id);

    return updated as unknown as Record<string, unknown>;
  }

  async detail(organizationId: string, id: string): Promise<Record<string, unknown>> {
    const detail = await this.prisma.license.findFirst({
      where: { id, organization_id: organizationId },
      include: {
        client: { select: { name: true } },
        responsible: { select: { name: true } },
      },
    });
    if (!detail) {
      throw new ServiceError(404, "Alvara nao encontrado.");
    }

    return detail as unknown as Record<string, unknown>;
  }

  async list(params: {
    organizationId: string;
    status: string;
    page: number;
    limit: number;
    paginationRequested: boolean;
  }): Promise<Record<string, unknown>[] | Record<string, unknown>> {
    const where = {
      organization_id: params.organizationId,
      ...(params.status === "Todos" ? {} : { status: params.status }),
    };
    const findManyArgs = {
      where,
      orderBy: {
        entry_date: "desc",
      },
      ...(params.paginationRequested
        ? { skip: (params.page - 1) * params.limit, take: params.limit }
        : {}),
    } as const;

    if (!params.paginationRequested) {
      return this.prisma.license.findMany(findManyArgs) as unknown as Record<string, unknown>[];
    }

    const [list, total] = await Promise.all([
      this.prisma.license.findMany(findManyArgs),
      this.prisma.license.count({ where }),
    ]);

    return {
      data: list,
      total,
      page: params.page,
      limit: params.limit,
      hasMore: params.page * params.limit < total,
    };
  }

  private async ensureClientExists(organizationId: string, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!client) {
      throw new ServiceError(404, "Cliente nao encontrado.");
    }
  }
}
