/**
 * Port dos services NCM/IPI/busca de `services/fiscal-service`. Os originais importam o
 * Prisma/auditoria Node no topo do módulo (lê `process.env`, `pg`, `dotenv`), então não
 * podem ser carregados no Worker; o comportamento e as mensagens são mantidos 1:1.
 */
import { getPaginationParams } from "@workspace/fiscal-service/src/schemas/pagination.schemas.js";
import { ServiceError } from "@workspace/shared/http";
import type { FiscalAudit } from "./audit.js";

type Row = Record<string, unknown>;

type Delegate = {
  findFirst(args: object): Promise<Row | null>;
  findMany(args: object): Promise<Row[]>;
  count(args: object): Promise<number>;
  create(args: object): Promise<Row & { id: string }>;
  update(args: object): Promise<Row>;
  delete(args: object): Promise<Row>;
};

export type FiscalAuthContext = { userId: string; organizationId: string; permission?: number };

type ListQuery = { page?: number; page_size?: number } & Record<string, unknown>;

type CatalogConfig = {
  model: "ipi" | "ncm";
  label: "IPI" | "NCM";
  idKey: "ipi_id" | "ncm_id";
  listKey: "ipiCodes" | "ncmCodes";
  codeField: "ncm" | "ncm_code";
  select: Record<string, true>;
};

const IPI_SELECT = { id: true, ncm: true, ex: true, description: true, aliquot: true } as const;

const NCM_SELECT = {
  id: true,
  tax_regime: true,
  ncm_code: true,
  federal_taxation_type: true,
  description: true,
  ncm_notes: true,
  cst_pis_outgoing: true,
  cst_cofins_outgoing: true,
  product_group: true,
  validity_start_date: true,
  information_source: true,
  reference_legislation: true,
  validity_end_date: true,
} as const;

const ICMS_SELECT = {
  id: true,
  state: true,
  item_number: true,
  cest_code: true,
  description: true,
  interstate_agreement: true,
  applied_original_mva: true,
  adjusted_mva: true,
  original_mva: true,
} as const;

class FiscalCatalogService {
  private readonly delegate: Delegate;

  constructor(
    prisma: Partial<Record<CatalogConfig["model"], Delegate>>,
    private readonly audit: FiscalAudit,
    private readonly config: CatalogConfig,
  ) {
    this.delegate = prisma[config.model] as Delegate;
  }

  private get referring() {
    return `fiscal.${this.config.model}`;
  }

  async create(data: FiscalAuthContext & Row): Promise<{ create: unknown }> {
    const { userId, organizationId, permission, ...fields } = data;
    const exists = await this.delegate.findFirst({
      where: { organization_id: organizationId, ...fields },
    });
    if (exists) throw new ServiceError(409, "Já cadastrado.");

    const create = await this.delegate.create({
      data: { organization_id: organizationId, ...fields },
      select: this.config.select,
    });
    await this.audit.createLog({
      userId,
      organizationId,
      permission: permission ?? null,
      action: "Cadastro",
      referring: this.referring,
      referringId: create.id,
      changes: "{}",
    });
    return { create };
  }

  async update(data: FiscalAuthContext & Row): Promise<unknown> {
    const { userId, organizationId, permission, [this.config.idKey]: id, ...fields } = data;
    try {
      const exists = await this.delegate.findFirst({
        where: { id, organization_id: organizationId },
      });
      if (!exists) throw new ServiceError(404, `${this.config.label} não existe.`);

      const updated = await this.delegate.update({
        where: { id },
        data: fields,
        select: this.config.select,
      });
      await this.audit.logUpdateIfChanged({
        userId,
        organizationId,
        permission: permission ?? null,
        action: "Atualização",
        referring: this.referring,
        referringId: String(id),
        oldData: exists,
        updatedData: updated,
      });
      return updated;
    } catch (err) {
      console.error({ event: `fiscal.${this.config.model}.update.failed`, err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar.", err);
    }
  }

  async delete(data: FiscalAuthContext & Row): Promise<{ deleted: unknown }> {
    const { userId, organizationId, permission } = data;
    const id = data[this.config.idKey];
    try {
      const exists = await this.delegate.findFirst({
        where: { id, organization_id: organizationId },
        select: this.config.select,
      });
      if (!exists) throw new ServiceError(404, `${this.config.label} não existe.`);

      const deleted = await this.delegate.delete({ where: { id }, select: this.config.select });
      await this.audit.createLog({
        userId,
        organizationId,
        permission: permission ?? null,
        action: "Exclusao",
        referring: this.referring,
        referringId: String(id),
        changes: exists,
      });
      return { deleted };
    } catch (err) {
      console.error({ event: `fiscal.${this.config.model}.delete.failed`, err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao excluir.", err);
    }
  }

  async detail(id: string, organizationId: string): Promise<{ detail: unknown }> {
    const detail = await this.delegate.findFirst({
      where: { id, organization_id: organizationId },
      select: this.config.select,
    });
    if (!detail) throw new ServiceError(404, `${this.config.label} não encontrado.`);
    return { detail };
  }

  async list(query: ListQuery, organizationId: string) {
    const page = query.page ?? 1;
    const { skip, take } = getPaginationParams(query);
    const codes = (query[this.config.listKey] as string[] | undefined) ?? [];
    const terms = codes.map((code) => code.trim()).filter(Boolean);
    const where = {
      organization_id: organizationId,
      ...(terms.length > 0
        ? {
            OR: terms.map((code) => ({
              [this.config.codeField]: { contains: code, mode: "insensitive" },
            })),
          }
        : {}),
    };
    const [total, data] = await Promise.all([
      this.delegate.count({ where }),
      this.delegate.findMany({
        where,
        select: this.config.select,
        orderBy: { [this.config.codeField]: "asc" },
        skip,
        take,
      }),
    ]);
    return { data, total, page, limit: take, hasMore: page * take < total };
  }
}

export class IpiService extends FiscalCatalogService {
  constructor(prisma: { ipi: unknown }, audit: FiscalAudit) {
    super(prisma as { ipi: Delegate }, audit, {
      model: "ipi",
      label: "IPI",
      idKey: "ipi_id",
      listKey: "ipiCodes",
      codeField: "ncm",
      select: IPI_SELECT,
    });
  }
}

export class NcmService extends FiscalCatalogService {
  constructor(prisma: { ncm: unknown }, audit: FiscalAudit) {
    super(prisma as { ncm: Delegate }, audit, {
      model: "ncm",
      label: "NCM",
      idKey: "ncm_id",
      listKey: "ncmCodes",
      codeField: "ncm_code",
      select: NCM_SELECT,
    });
  }
}

type SearchPrisma = {
  ncm: { findFirst(args: object): unknown };
  icms: { findMany(args: object): unknown };
  ipi: { findMany(args: object): unknown };
  $transaction(queries: unknown[]): Promise<unknown[]>;
};

export class FiscalSearchService {
  constructor(private readonly prisma: SearchPrisma) {}

  async searchByNcmCode(ncmCode: string, organizationId: string) {
    const ncmPrefix = ncmCode.substring(0, 4);
    const [ncm, icms, ipi] = await this.prisma.$transaction([
      this.prisma.ncm.findFirst({
        where: { organization_id: organizationId, ncm_code: ncmCode },
        select: NCM_SELECT,
      }),
      this.prisma.icms.findMany({
        where: {
          organization_id: organizationId,
          description: { contains: ncmPrefix, mode: "insensitive" },
        },
        select: ICMS_SELECT,
      }),
      this.prisma.ipi.findMany({
        where: { organization_id: organizationId, ncm: ncmCode },
        select: IPI_SELECT,
        orderBy: { ncm: "asc" },
      }),
    ]);
    return { ncm, icms: icms as unknown[], ipi: ipi as unknown[] };
  }
}
