import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  error as logError,
  REGULARIZE_GUIDANCE_CHECKLIST_ITEMS,
  REGULARIZE_GUIDANCE_CHECKLIST_STATUSES,
  type RegularizeGuidanceSnapshot,
  type RegularizeGuidanceTargetType,
  ServiceError,
} from "@workspace/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateGuidanceBody,
  GuidanceEconomicActivity,
  GuidancePartner,
  UpdateGuidanceBody,
} from "../schemas/guidance.schemas.js";
import {
  assertCompleteGuidanceChecklist,
  type GuidanceChecklistItem,
  resolveBranchData,
} from "./guidanceChecklist.js";
import { type GuidanceTargetInput, resolveGuidanceTarget } from "./guidanceTarget.js";
import { RegularizeLogService } from "./regularizeLogService.js";

const include = { checklist_items: true } as const;
const checklistLabels = Object.fromEntries(
  REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.map(({ code, label }) => [code, label]),
);
const [pending, completed] = REGULARIZE_GUIDANCE_CHECKLIST_STATUSES;
type ExpandedGuidance = Prisma.ProceduralGuidanceGetPayload<{ include: typeof include }>;
type LegacyInput = { organizationId: string; userId: string; guidanceId: string };

function expanded(guidance: ExpandedGuidance): Record<string, unknown> {
  const items = new Map(guidance.checklist_items.map((item) => [item.code, item]));
  return {
    ...guidance,
    checklist_items: REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.flatMap(({ code }) => {
      const item = items.get(code);
      return item ? [item] : [];
    }),
  };
}

function checklistRows(checklist: GuidanceChecklistItem[]) {
  return assertCompleteGuidanceChecklist(checklist).map((item, index) => ({
    code: item.code,
    label: REGULARIZE_GUIDANCE_CHECKLIST_ITEMS[index].label,
    status: item.status,
    observation: item.observation ?? null,
  }));
}

function checklistUpdates(id: string, rows: ReturnType<typeof checklistRows>) {
  return {
    upsert: rows.map((row) => ({
      where: { guidance_id_code: { guidance_id: id, code: row.code } },
      create: row,
      update: row,
    })),
  };
}

function sameChecklist(
  existingItems: ExpandedGuidance["checklist_items"],
  rows: ReturnType<typeof checklistRows>,
): boolean {
  if (existingItems.length !== rows.length) return false;

  const existingByCode = new Map(existingItems.map((item) => [item.code, item]));
  return rows.every((row) => {
    const existing = existingByCode.get(row.code);
    return (
      existing !== undefined &&
      existing.status === row.status &&
      (existing.observation ?? null) === row.observation
    );
  });
}

export class GuidanceService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    organizationId: string;
    userId: string;
    body: CreateGuidanceBody;
  }): Promise<Record<string, unknown>> {
    return this.transaction(async (tx) => {
      const { checklist, branch_data, economic_activities, partners, ...fields } = input.body;
      await this.ensureProcessExists(tx, input.organizationId, fields.process_id);
      const target = await this.targetData(tx, input.organizationId, fields);
      const rows = checklistRows(checklist);
      const branch = resolveBranchData(checklist, branch_data);
      const created = await tx.proceduralGuidance.create({
        data: {
          ...fields,
          ...target,
          organization_id: input.organizationId,
          process_id: fields.process_id ?? null,
          branch_data: branch === null ? Prisma.DbNull : (branch as Prisma.InputJsonObject),
          economic_activities: (economic_activities ?? []).map((item) => ({
            ...item,
            id: item.id ?? randomUUID(),
          })),
          partners: (partners ?? []).map((item) => ({ ...item, id: item.id ?? randomUUID() })),
          checklist_items: { create: rows },
        },
        include,
      });
      await new RegularizeLogService(tx).createLog({
        userId: input.userId,
        organizationId: input.organizationId,
        action: "Cadastro",
        referring: "regularize.guidance",
        referringId: created.id,
        changes: "{}",
      });
      return expanded(created);
    });
  }

  async update(input: {
    organizationId: string;
    userId: string;
    body: UpdateGuidanceBody;
  }): Promise<Record<string, unknown>> {
    return this.transaction(async (tx) => {
      const {
        id,
        checklist,
        branch_data,
        target_type,
        target_snapshot,
        client_pj_id,
        client_pf_id,
        ...fields
      } = input.body;
      const existing = await this.getGuidance(tx, input.organizationId, id);
      await this.ensureProcessExists(tx, input.organizationId, fields.process_id);
      const data: Prisma.ProceduralGuidanceUncheckedUpdateInput = { ...fields };
      if ([target_type, target_snapshot, client_pj_id, client_pf_id].some((v) => v !== undefined)) {
        const changingType = target_type !== undefined && target_type !== existing.target_type;
        Object.assign(
          data,
          await this.targetData(tx, input.organizationId, {
            target_type: target_type ?? (existing.target_type as RegularizeGuidanceTargetType),
            client_pj_id:
              client_pj_id !== undefined
                ? client_pj_id
                : changingType
                  ? null
                  : existing.client_pj_id,
            client_pf_id:
              client_pf_id !== undefined
                ? client_pf_id
                : changingType
                  ? null
                  : existing.client_pf_id,
            target_snapshot:
              target_snapshot ??
              (changingType ? undefined : (existing.target_snapshot as RegularizeGuidanceSnapshot)),
          }),
        );
      }
      if (checklist !== undefined) {
        const rows = checklistRows(checklist);
        const branch = resolveBranchData(checklist, branch_data);
        if (
          !sameChecklist(existing.checklist_items, rows) ||
          !isDeepStrictEqual(existing.branch_data ?? null, branch)
        ) {
          data.checklist_items = checklistUpdates(id, rows);
          data.branch_data = branch === null ? Prisma.DbNull : (branch as Prisma.InputJsonObject);
        }
      } else if (branch_data !== undefined) {
        throw new ServiceError(422, "Dados da filial exigem checklist.");
      }
      if (Object.keys(data).length === 0) return expanded(existing);
      const updated = await tx.proceduralGuidance.update({
        where: { id, organization_id: input.organizationId },
        data,
        include,
      });
      await new RegularizeLogService(tx).logUpdateIfChanged({
        userId: input.userId,
        organizationId: input.organizationId,
        action: "Atualizacao",
        referring: "regularize.guidance",
        referringId: id,
        oldData: expanded(existing),
        updatedData: expanded(updated),
      });
      return expanded(updated);
    });
  }

  async detail(organizationId: string, id: string): Promise<Record<string, unknown>> {
    return expanded(await this.getGuidance(this.prisma, organizationId, id));
  }

  async listByProcess(
    organizationId: string,
    processId?: string,
  ): Promise<Record<string, unknown>[]> {
    const list = await this.prisma.proceduralGuidance.findMany({
      where: {
        organization_id: organizationId,
        ...(processId === undefined ? {} : { process_id: processId }),
      },
      include,
    });
    return list.map(expanded);
  }

  async addEconomicActivity(
    input: LegacyInput & {
      activity: GuidanceEconomicActivity;
    },
  ): Promise<Record<string, unknown>> {
    const item = { ...input.activity, id: input.activity.id ?? randomUUID() };
    return this.changeLegacyItems(
      input,
      "economic_activities",
      "Adicionar Atividade",
      item,
      (current) => [...current, item],
    );
  }

  async removeEconomicActivity(
    input: LegacyInput & {
      itemId: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.changeLegacyItems(
      input,
      "economic_activities",
      "Remover Atividade",
      { removed_id: input.itemId },
      (current) => current.filter((item) => item.id !== input.itemId),
    );
  }

  async addPartner(
    input: LegacyInput & {
      partner: GuidancePartner;
    },
  ): Promise<Record<string, unknown>> {
    const item = { ...input.partner, id: input.partner.id ?? randomUUID() };
    return this.changeLegacyItems(input, "partners", "Adicionar Socio", item, (current) => [
      ...current,
      item,
    ]);
  }

  async removePartner(
    input: LegacyInput & {
      itemId: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.changeLegacyItems(
      input,
      "partners",
      "Remover Socio",
      { removed_id: input.itemId },
      (current) => current.filter((item) => item.id !== input.itemId),
    );
  }

  private async changeLegacyItems(
    input: LegacyInput,
    field: "economic_activities" | "partners",
    action: string,
    changes: unknown,
    change: (current: Prisma.JsonObject[]) => Prisma.JsonObject[],
  ): Promise<Record<string, unknown>> {
    return this.transaction(async (tx) => {
      const existing = await this.getGuidance(tx, input.organizationId, input.guidanceId);
      const items = change((existing[field] as Prisma.JsonObject[] | null) ?? []);
      const projection = {
        code: field,
        label: checklistLabels[field],
        status: items.length ? completed : pending,
      };
      const updated = await tx.proceduralGuidance.update({
        where: { id: input.guidanceId, organization_id: input.organizationId },
        data: {
          [field]: items,
          checklist_items: {
            upsert: [
              {
                where: { guidance_id_code: { guidance_id: input.guidanceId, code: field } },
                create: projection,
                update: projection,
              },
            ],
          },
        },
        include,
      });
      await new RegularizeLogService(tx).createLog({
        userId: input.userId,
        organizationId: input.organizationId,
        action,
        referring: "regularize.guidance",
        referringId: input.guidanceId,
        changes,
      });
      return expanded(updated);
    });
  }

  private async targetData(
    tx: Prisma.TransactionClient,
    organizationId: string,
    input: GuidanceTargetInput,
  ) {
    const target = await resolveGuidanceTarget(tx, organizationId, input);
    return {
      target_type: target.targetType,
      client_pj_id: target.clientPjId,
      client_pf_id: target.clientPfId,
      target_snapshot: target.snapshot as Prisma.InputJsonObject,
    };
  }

  private async ensureProcessExists(
    tx: Prisma.TransactionClient,
    organizationId: string,
    processId?: string | null,
  ): Promise<void> {
    if (processId == null) return;
    const process = await tx.process.findFirst({
      where: { id: processId, organization_id: organizationId },
      select: { id: true },
    });
    if (!process) throw new ServiceError(404, "Processo nao encontrado.");
  }

  private async getGuidance(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<ExpandedGuidance> {
    const guidance = await tx.proceduralGuidance.findFirst({
      where: { id, organization_id: organizationId },
      include,
    });
    if (!guidance) throw new ServiceError(404, "Orientacao nao encontrada.");
    return guidance;
  }

  private async transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation);
    } catch (err: unknown) {
      logError("Falha na transacao de orientacao.", {
        code: err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined,
      });
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ServiceError(409, "Ja existe orientacao em andamento para este processo.");
      }
      throw err;
    }
  }
}
