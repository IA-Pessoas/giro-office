import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import type { ParcelamentoRequestContext } from "../middlewares/requestContext.js";
import type { ParcelamentoPrismaClient } from "../prisma/index.js";
import { createPage, getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  CreatePanoramaBody,
  ListPanoramasQuery,
  PatchPanoramaBody,
} from "../schemas/panorama.schemas.js";
import type { ParcelamentoPage } from "./installmentService.js";

const ACTIVE_CLIENT_STATUS = "Ativo";

export type PanoramaServiceDependencies = {
  prisma: ParcelamentoPrismaClient;
};

export type GeneratePanoramasResult = {
  created: number;
  existing: number;
  totalActiveClients: number;
};

const panoramaSelect = {
  id: true,
  competence: true,
  cnd_municipal: true,
  cnd_state: true,
  cnd_federal: true,
  cnd_fgts: true,
  cnd_labor: true,
  protests: true,
  state_tax_situation: true,
  federal_tax_situation: true,
  responsavel_id: true,
  client_id: true,
  organization_id: true,
} as const;

type PanoramaRecord = Prisma.PanoramaParcelametoGetPayload<{ select: typeof panoramaSelect }>;

export type PanoramaDto = Omit<PanoramaRecord, "organization_id">;

function requireContext(context: Pick<ParcelamentoRequestContext, "organizationId" | "userId">): {
  organizationId: string;
  userId: string;
} {
  if (!context.organizationId) {
    throw new ServiceError(400, "Contexto de organizacao ausente.");
  }

  if (!context.userId) {
    throw new ServiceError(400, "Contexto de usuario ausente.");
  }

  return { organizationId: context.organizationId, userId: context.userId };
}

function omitUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function hasOwn(input: object, key: string): boolean {
  return Object.keys(input).includes(key);
}

function toPanoramaDto(panorama: PanoramaRecord): PanoramaDto {
  const { organization_id: _organizationId, ...dto } = panorama;

  return dto;
}

function isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

function panoramaDefaults(): {
  cnd_municipal: boolean;
  cnd_state: boolean;
  cnd_federal: boolean;
  cnd_fgts: boolean;
  cnd_labor: boolean;
  protests: boolean;
  state_tax_situation: boolean;
  federal_tax_situation: boolean;
} {
  return {
    cnd_municipal: false,
    cnd_state: false,
    cnd_federal: false,
    cnd_fgts: false,
    cnd_labor: false,
    protests: false,
    state_tax_situation: false,
    federal_tax_situation: false,
  };
}

export class PanoramaService {
  private readonly prisma: ParcelamentoPrismaClient;

  constructor({ prisma }: PanoramaServiceDependencies) {
    this.prisma = prisma;
  }

  async list(
    context: Pick<ParcelamentoRequestContext, "organizationId" | "userId">,
    query: ListPanoramasQuery,
  ): Promise<ParcelamentoPage<PanoramaDto>> {
    try {
      const { organizationId } = requireContext(context);
      const { page, pageSize, skip, take } = getPaginationParams(query);
      const where = omitUndefined({
        organization_id: organizationId,
        competence: query.competence,
        client_id: query.client_id,
        responsavel_id: query.responsavel_id,
      });

      const [total, items] = await Promise.all([
        this.prisma.panoramaParcelameto.count({ where }),
        this.prisma.panoramaParcelameto.findMany({
          where,
          select: panoramaSelect,
          orderBy: { id: "asc" },
          skip,
          take,
        }),
      ]);

      return createPage({ items: items.map(toPanoramaDto), total, page, pageSize });
    } catch (err: unknown) {
      logError("Erro ao listar panoramas de parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao listar panoramas de parcelamento.", err);
    }
  }

  async create(
    context: ParcelamentoRequestContext,
    input: CreatePanoramaBody,
  ): Promise<PanoramaDto> {
    try {
      const { organizationId } = requireContext(context);
      await this.ensureClient(organizationId, input.client_id);
      if (input.responsavel_id) {
        await this.ensureResponsavel(organizationId, input.responsavel_id);
      }
      await this.ensureUniquePanorama(organizationId, input.client_id, input.competence);

      const created = await this.prisma.panoramaParcelameto.create({
        data: {
          ...panoramaDefaults(),
          cnd_municipal: input.cnd_municipal ?? false,
          cnd_state: input.cnd_state ?? false,
          cnd_federal: input.cnd_federal ?? false,
          cnd_fgts: input.cnd_fgts ?? false,
          cnd_labor: input.cnd_labor ?? false,
          protests: input.protests ?? false,
          state_tax_situation: input.state_tax_situation ?? false,
          federal_tax_situation: input.federal_tax_situation ?? false,
          responsavel_id: input.responsavel_id ?? null,
          client_id: input.client_id,
          competence: input.competence,
          organization_id: organizationId,
        },
        select: panoramaSelect,
      });

      return toPanoramaDto(created);
    } catch (err: unknown) {
      logError("Erro ao criar panorama de parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueError(err)) {
        throw new ServiceError(409, "Ja existe panorama para este cliente e competencia.", err);
      }
      throw new ServiceError(500, "Erro ao criar panorama de parcelamento.", err);
    }
  }

  async getById(
    context: Pick<ParcelamentoRequestContext, "organizationId" | "userId">,
    id: string,
  ): Promise<PanoramaDto> {
    try {
      const { organizationId } = requireContext(context);
      const panorama = await this.findByIdOrThrow(organizationId, id);

      return toPanoramaDto(panorama);
    } catch (err: unknown) {
      logError("Erro ao detalhar panorama de parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao detalhar panorama de parcelamento.", err);
    }
  }

  async patch(
    context: ParcelamentoRequestContext,
    id: string,
    input: PatchPanoramaBody,
  ): Promise<PanoramaDto> {
    try {
      const { organizationId } = requireContext(context);
      await this.findByIdOrThrow(organizationId, id);
      if (input.responsavel_id) {
        await this.ensureResponsavel(organizationId, input.responsavel_id);
      }

      const data = omitUndefined({
        cnd_municipal: input.cnd_municipal,
        cnd_state: input.cnd_state,
        cnd_federal: input.cnd_federal,
        cnd_fgts: input.cnd_fgts,
        cnd_labor: input.cnd_labor,
        protests: input.protests,
        state_tax_situation: input.state_tax_situation,
        federal_tax_situation: input.federal_tax_situation,
        responsavel_id: hasOwn(input, "responsavel_id") ? input.responsavel_id : undefined,
      });

      await this.prisma.panoramaParcelameto.updateMany({
        where: { id, organization_id: organizationId },
        data,
      });
      const updated = await this.findByIdOrThrow(organizationId, id);

      return toPanoramaDto(updated);
    } catch (err: unknown) {
      logError("Erro ao atualizar panorama de parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar panorama de parcelamento.", err);
    }
  }

  async generateForCompetence(
    context: ParcelamentoRequestContext,
    competence: string,
  ): Promise<GeneratePanoramasResult> {
    try {
      const { organizationId } = requireContext(context);
      const activeClients = await this.prisma.client.findMany({
        where: { organization_id: organizationId, status: ACTIVE_CLIENT_STATUS },
        select: { id: true },
      });
      const clientIds = activeClients.map((client) => client.id);

      if (clientIds.length === 0) {
        return { created: 0, existing: 0, totalActiveClients: 0 };
      }

      const existingRows = await this.prisma.panoramaParcelameto.findMany({
        where: {
          organization_id: organizationId,
          competence,
          client_id: { in: clientIds },
        },
        select: { client_id: true },
      });
      const existingClientIds = new Set(existingRows.map((row) => row.client_id));
      const data = activeClients
        .filter((client) => !existingClientIds.has(client.id))
        .map((client) => ({
          ...panoramaDefaults(),
          client_id: client.id,
          competence,
          organization_id: organizationId,
        }));

      const result =
        data.length > 0
          ? await this.prisma.panoramaParcelameto.createMany({ data, skipDuplicates: true })
          : { count: 0 };

      return {
        created: result.count,
        existing: existingRows.length,
        totalActiveClients: activeClients.length,
      };
    } catch (err: unknown) {
      logError("Erro ao gerar panoramas de parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao gerar panoramas de parcelamento.", err);
    }
  }

  private async ensureClient(organizationId: string, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
    });

    if (!client) {
      throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
    }
  }

  private async ensureResponsavel(organizationId: string, responsavelId: string): Promise<void> {
    const responsavel = await this.prisma.user.findFirst({
      where: { id: responsavelId, organization_id: organizationId },
    });

    if (!responsavel) {
      throw new ServiceError(404, "Responsavel nao encontrado para a organizacao.");
    }
  }

  private async ensureUniquePanorama(
    organizationId: string,
    clientId: string,
    competence: string,
  ): Promise<void> {
    const existing = await this.prisma.panoramaParcelameto.findFirst({
      where: {
        organization_id: organizationId,
        client_id: clientId,
        competence,
      },
    });

    if (existing) {
      throw new ServiceError(409, "Ja existe panorama para este cliente e competencia.");
    }
  }

  private async findByIdOrThrow(organizationId: string, id: string): Promise<PanoramaRecord> {
    const panorama = await this.prisma.panoramaParcelameto.findFirst({
      where: { id, organization_id: organizationId },
      select: panoramaSelect,
    });

    if (!panorama) {
      throw new ServiceError(404, "Panorama de parcelamento nao encontrado.");
    }

    return panorama;
  }
}
