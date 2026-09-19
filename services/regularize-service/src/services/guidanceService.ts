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
type GuidanceJsonRow = Prisma.JsonObject & { id?: string };

function cleanText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function comparisonKey(value: string): string {
  return cleanText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function normalizeCpf(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits || comparisonKey(value).replace(/\s/g, "");
}

function normalizeActivity(item: GuidanceEconomicActivity | GuidanceJsonRow): GuidanceJsonRow {
  const raw = item as Record<string, unknown>;
  return {
    ...raw,
    id: typeof raw.id === "string" ? raw.id : randomUUID(),
    code: cleanText(raw.code),
    description: cleanText(raw.description),
    type: raw.type === "Principal" ? "Principal" : "Secundária",
  } as GuidanceJsonRow;
}

function normalizePartner(item: GuidancePartner | GuidanceJsonRow): GuidanceJsonRow {
  const raw = item as Record<string, unknown>;
  const percentage = raw.percentage ?? raw.share;
  return {
    ...raw,
    id: typeof raw.id === "string" ? raw.id : randomUUID(),
    name: cleanText(raw.name),
    cpf: normalizeCpf(cleanText(raw.cpf)),
    ...(percentage === undefined ? {} : { percentage, share: percentage }),
    ...(raw.role === undefined ? {} : { role: cleanText(raw.role) }),
    ...(raw.profession === undefined ? {} : { profession: cleanText(raw.profession) }),
    ...(raw.marital_status === undefined ? {} : { marital_status: cleanText(raw.marital_status) }),
    ...(raw.rg === undefined ? {} : { rg: cleanText(raw.rg) }),
    ...(raw.cnh === undefined ? {} : { cnh: cleanText(raw.cnh) }),
    ...(raw.address === undefined ? {} : { address: cleanText(raw.address) }),
  } as GuidanceJsonRow;
}

function normalizeActivities(
  items: Array<GuidanceEconomicActivity | GuidanceJsonRow>,
  principalId?: string,
): GuidanceJsonRow[] {
  const normalized = items.map(normalizeActivity);
  const codes = new Set<string>();
  const descriptions = new Set<string>();

  for (const item of normalized) {
    const code = comparisonKey(String(item.code));
    const description = comparisonKey(String(item.description));
    if (codes.has(code) || descriptions.has(description)) {
      throw new ServiceError(409, "Atividade duplicada na orientacao.");
    }
    codes.add(code);
    descriptions.add(description);
  }

  const principalCount = normalized.filter((item) => item.type === "Principal").length;
  if (principalCount > 1 && principalId === undefined) {
    throw new ServiceError(409, "A orientacao aceita no maximo uma atividade principal.");
  }

  return normalized.map((item) => ({
    ...item,
    type:
      principalId === undefined ? item.type : item.id === principalId ? "Principal" : "Secundária",
  }));
}

function normalizePartners(items: Array<GuidancePartner | GuidanceJsonRow>): GuidanceJsonRow[] {
  const normalized = items.map(normalizePartner);
  const cpfs = new Set<string>();
  for (const item of normalized) {
    const cpf = String(item.cpf);
    if (cpfs.has(cpf)) {
      throw new ServiceError(409, "O CPF ja existe nesta orientacao.");
    }
    cpfs.add(cpf);
  }
  return normalized;
}

function guidanceItems(
  guidance: ExpandedGuidance,
  field: "economic_activities" | "partners",
): GuidanceJsonRow[] {
  return Array.isArray(guidance[field]) ? (guidance[field] as GuidanceJsonRow[]) : [];
}

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
      const activities = normalizeActivities(
        (economic_activities ?? []) as GuidanceEconomicActivity[],
      );
      const partnerRows = normalizePartners((partners ?? []) as GuidancePartner[]);
      const created = await tx.proceduralGuidance.create({
        data: {
          ...fields,
          ...target,
          organization_id: input.organizationId,
          process_id: fields.process_id ?? null,
          branch_data: branch === null ? Prisma.DbNull : (branch as Prisma.InputJsonObject),
          economic_activities: activities,
          partners: partnerRows,
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
    targetType?: RegularizeGuidanceTargetType,
  ): Promise<Record<string, unknown>[]> {
    const list = await this.prisma.proceduralGuidance.findMany({
      where: {
        organization_id: organizationId,
        ...(processId === undefined ? {} : { process_id: processId }),
        ...(targetType === undefined ? {} : { target_type: targetType }),
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
    const item = normalizeActivity(input.activity);
    return this.changeItems(input, "economic_activities", "Adicionar Atividade", (current) =>
      normalizeActivities([...current, item], item.type === "Principal" ? item.id : undefined),
    );
  }

  async updateEconomicActivity(
    input: LegacyInput & {
      activity: GuidanceEconomicActivity;
    },
  ): Promise<Record<string, unknown>> {
    return this.changeItems(input, "economic_activities", "Atualizar Atividade", (current) => {
      const existing = current.find((item) => item.id === input.activity.id);
      if (!existing) throw new ServiceError(404, "Atividade nao encontrada na orientacao.");
      const item = normalizeActivity(input.activity);
      const next = current.map((candidate) => (candidate.id === item.id ? item : candidate));
      return normalizeActivities(next, item.type === "Principal" ? item.id : undefined);
    });
  }

  async removeEconomicActivity(
    input: LegacyInput & {
      itemId: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.changeItems(input, "economic_activities", "Remover Atividade", (current) => {
      if (!current.some((item) => item.id === input.itemId)) {
        throw new ServiceError(404, "Atividade nao encontrada na orientacao.");
      }
      return normalizeActivities(current.filter((item) => item.id !== input.itemId));
    });
  }

  async addPartner(
    input: LegacyInput & {
      partner: GuidancePartner;
    },
  ): Promise<Record<string, unknown>> {
    const item = normalizePartner(input.partner);
    return this.changeItems(input, "partners", "Adicionar Socio", (current) =>
      normalizePartners([...current, item]),
    );
  }

  async updatePartner(
    input: LegacyInput & {
      partner: GuidancePartner;
    },
  ): Promise<Record<string, unknown>> {
    return this.changeItems(input, "partners", "Atualizar Socio", (current) => {
      const item = normalizePartner(input.partner);
      if (!current.some((candidate) => candidate.id === item.id)) {
        throw new ServiceError(404, "Socio nao encontrado na orientacao.");
      }
      return normalizePartners(
        current.map((candidate) => (candidate.id === item.id ? item : candidate)),
      );
    });
  }

  async removePartner(
    input: LegacyInput & {
      itemId: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.changeItems(input, "partners", "Remover Socio", (current) => {
      if (!current.some((item) => item.id === input.itemId)) {
        throw new ServiceError(404, "Socio nao encontrado na orientacao.");
      }
      return normalizePartners(current.filter((item) => item.id !== input.itemId));
    });
  }

  private async changeItems(
    input: LegacyInput,
    field: "economic_activities" | "partners",
    action: string,
    change: (current: GuidanceJsonRow[]) => GuidanceJsonRow[],
  ): Promise<Record<string, unknown>> {
    return this.transaction(async (tx) => {
      const existing = await this.getGuidance(tx, input.organizationId, input.guidanceId);
      const before = guidanceItems(existing, field);
      const items = change(before);
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
        changes: { before, after: items },
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
