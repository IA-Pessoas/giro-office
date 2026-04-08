import { randomUUID } from "node:crypto";

import { ServiceError } from "@workspace/shared";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateGuidanceBody,
  GuidanceEconomicActivity,
  GuidancePartner,
  UpdateGuidanceBody,
} from "../schemas/guidance.schema.js";
import { RegularizeLogService } from "./regularizeLogService.js";

export class GuidanceService {
  readonly #logs: RegularizeLogService;

  constructor(private readonly prisma: PrismaClient) {
    this.#logs = new RegularizeLogService(prisma);
  }

  async create(input: {
    organizationId: string;
    userId: string;
    body: CreateGuidanceBody;
  }): Promise<Record<string, unknown>> {
    await this.ensureProcessExists(input.organizationId, input.body.process_id);

    const activities =
      input.body.economic_activities?.map((item) => ({
        ...item,
        id: item.id ?? randomUUID(),
      })) ?? [];
    const partners =
      input.body.partners?.map((item) => ({
        ...item,
        id: item.id ?? randomUUID(),
      })) ?? [];

    const created = await this.prisma.proceduralGuidance.create({
      data: {
        ...input.body,
        organization_id: input.organizationId,
        economic_activities: activities as Prisma.JsonArray,
        partners: partners as Prisma.JsonArray,
      },
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Cadastro",
      referring: "regularize.guidance",
      referringId: created.id,
      changes: "{}",
    });

    return created as unknown as Record<string, unknown>;
  }

  async update(input: {
    organizationId: string;
    userId: string;
    body: UpdateGuidanceBody;
  }): Promise<Record<string, unknown>> {
    const existing = await this.prisma.proceduralGuidance.findFirst({
      where: { id: input.body.id, organization_id: input.organizationId },
    });
    if (!existing) {
      throw new ServiceError(404, "Orientacao nao encontrada.");
    }

    const { id, ...data } = input.body;
    const updated = await this.prisma.proceduralGuidance.update({
      where: { id },
      data,
    });

    await this.#logs.logUpdateIfChanged({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Atualizacao",
      referring: "regularize.guidance",
      referringId: id,
      oldData: existing as unknown as Record<string, unknown>,
      updatedData: updated as unknown as Record<string, unknown>,
    });

    return updated as unknown as Record<string, unknown>;
  }

  async detail(organizationId: string, id: string): Promise<Record<string, unknown>> {
    const detail = await this.prisma.proceduralGuidance.findFirst({
      where: { id, organization_id: organizationId },
    });
    if (!detail) {
      throw new ServiceError(404, "Orientacao nao encontrada.");
    }

    return detail as unknown as Record<string, unknown>;
  }

  async listByProcess(organizationId: string, processId: string): Promise<Record<string, unknown>[]> {
    const list = await this.prisma.proceduralGuidance.findMany({
      where: {
        organization_id: organizationId,
        process_id: processId,
      },
    });

    return list as unknown as Record<string, unknown>[];
  }

  async addEconomicActivity(input: {
    organizationId: string;
    userId: string;
    guidanceId: string;
    activity: GuidanceEconomicActivity;
  }): Promise<Record<string, unknown>> {
    const guidance = await this.getGuidance(input.organizationId, input.guidanceId);
    const current = (guidance.economic_activities as GuidanceEconomicActivity[] | null) ?? [];
    const newItem = { ...input.activity, id: randomUUID() };
    const updated = await this.prisma.proceduralGuidance.update({
      where: { id: input.guidanceId },
      data: {
        economic_activities: [...current, newItem] as Prisma.JsonArray,
      },
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Adicionar Atividade",
      referring: "regularize.guidance",
      referringId: input.guidanceId,
      changes: newItem,
    });

    return updated as unknown as Record<string, unknown>;
  }

  async removeEconomicActivity(input: {
    organizationId: string;
    userId: string;
    guidanceId: string;
    itemId: string;
  }): Promise<Record<string, unknown>> {
    const guidance = await this.getGuidance(input.organizationId, input.guidanceId);
    const current = (guidance.economic_activities as GuidanceEconomicActivity[] | null) ?? [];
    const updated = await this.prisma.proceduralGuidance.update({
      where: { id: input.guidanceId },
      data: {
        economic_activities: current.filter((item) => item.id !== input.itemId) as Prisma.JsonArray,
      },
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Remover Atividade",
      referring: "regularize.guidance",
      referringId: input.guidanceId,
      changes: { removed_id: input.itemId },
    });

    return updated as unknown as Record<string, unknown>;
  }

  async addPartner(input: {
    organizationId: string;
    userId: string;
    guidanceId: string;
    partner: GuidancePartner;
  }): Promise<Record<string, unknown>> {
    const guidance = await this.getGuidance(input.organizationId, input.guidanceId);
    const current = (guidance.partners as GuidancePartner[] | null) ?? [];
    const newItem = { ...input.partner, id: randomUUID() };
    const updated = await this.prisma.proceduralGuidance.update({
      where: { id: input.guidanceId },
      data: {
        partners: [...current, newItem] as Prisma.JsonArray,
      },
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Adicionar Socio",
      referring: "regularize.guidance",
      referringId: input.guidanceId,
      changes: newItem,
    });

    return updated as unknown as Record<string, unknown>;
  }

  async removePartner(input: {
    organizationId: string;
    userId: string;
    guidanceId: string;
    itemId: string;
  }): Promise<Record<string, unknown>> {
    const guidance = await this.getGuidance(input.organizationId, input.guidanceId);
    const current = (guidance.partners as GuidancePartner[] | null) ?? [];
    const updated = await this.prisma.proceduralGuidance.update({
      where: { id: input.guidanceId },
      data: {
        partners: current.filter((item) => item.id !== input.itemId) as Prisma.JsonArray,
      },
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Remover Socio",
      referring: "regularize.guidance",
      referringId: input.guidanceId,
      changes: { removed_id: input.itemId },
    });

    return updated as unknown as Record<string, unknown>;
  }

  private async ensureProcessExists(organizationId: string, processId: string): Promise<void> {
    const process = await this.prisma.process.findFirst({
      where: { id: processId, organization_id: organizationId },
      select: { id: true },
    });
    if (!process) {
      throw new ServiceError(404, "Processo nao encontrado.");
    }
  }

  private async getGuidance(organizationId: string, id: string) {
    const guidance = await this.prisma.proceduralGuidance.findFirst({
      where: { id, organization_id: organizationId },
    });
    if (!guidance) {
      throw new ServiceError(404, "Orientacao nao encontrada.");
    }
    return guidance;
  }
}
