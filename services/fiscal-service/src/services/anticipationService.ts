import { ServiceError } from "@workspace/shared/http";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLogParams } from "../integrations/audit.js";
import {
  ANTICIPATION_CORRECTABLE_FIELDS,
  type AnticipationBatchStatus,
  type AnticipationClassification,
  type AnticipationCorrectableField,
  type CheckAnticipationBatchBody,
  type ImportAnticipationBatchBody,
  type ListAnticipationBatchesQuery,
  type UpdateAnticipationItemBody,
} from "../schemas/anticipation.schemas.js";
import { competenceDate, competenceKey } from "../schemas/competence.schemas.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type { AnticipationDemonstrative } from "./anticipationExportService.js";
import {
  dropIdenticalCopies,
  isAuthorizedProtocol,
  type NfeFile,
  normalizeDecimal,
  readNfeArchive,
} from "./nfeXml.js";

// Sem imports Node no topo: o Worker fiscal reaproveita este serviço como está.

/**
 * Antecipações (E3, FIS-16): importa ZIP de XML NF-e num lote por cliente e competência, com os
 * itens rastreáveis até o arquivo de origem. Não calcula imposto (RF-13): a revisão é manual.
 * FIS-17: o responsável classifica e corrige os itens (valores do XML ficam preservados) e um
 * conferente aprova ou devolve o lote; cada mudança vai para o histórico na mesma transação.
 */

type AnticipationTransaction = Pick<
  PrismaClient,
  "fiscalAnticipationBatch" | "fiscalAnticipationItem" | "fiscalAnticipationHistory"
>;

export type AnticipationPrisma = Pick<
  PrismaClient,
  | "client"
  | "user"
  | "permission"
  | "fiscalAnticipationBatch"
  | "fiscalAnticipationItem"
  | "fiscalAnticipationHistory"
> & {
  $transaction<T>(callback: (transaction: AnticipationTransaction) => Promise<T>): Promise<T>;
};

export interface AnticipationIssue {
  entry: string;
  kind: "error" | "discarded" | "duplicate";
  message: string;
}

interface Actor {
  organizationId: string;
  userId: string;
  permission?: number;
}

type Amount = { toString(): string } | string | null;

type BatchRecord = {
  id: string;
  client_id: string;
  competence: Date;
  file_name: string;
  status: string;
  responsible_id: string;
  reviewer_id: string | null;
  entry_count: number;
  note_count: number;
  item_count: number;
  issues: unknown;
  created_by: string;
  createdAt: Date;
  updatedAt: Date;
};

type ItemRecord = {
  id?: string;
  entry: string;
  access_key: string;
  issuer: string;
  model: string;
  series: string;
  note_number: string;
  item_number: number;
  code: string;
  description: string;
  ncm: string;
  cfop: string;
  quantity: Amount;
  value: Amount;
  ipi: Amount;
  icms_st: Amount;
  classification?: string | null;
  manual_value?: Amount;
  corrections?: unknown;
};

type Corrections = Partial<Record<AnticipationCorrectableField, string>>;

/** Uma linha do histórico da revisão antes de receber lote, item, motivo e ator. */
type HistoryChange = { field: string; previous_value: string | null; new_value: string | null };

const FISCAL_WRITE_PERMISSION = 2;
const FISCAL_AUTHORIZE_PERMISSION = 3;

export interface AnticipationBatchDto {
  id: string;
  client_id: string;
  competence: string;
  file_name: string;
  status: AnticipationBatchStatus;
  responsible_id: string;
  reviewer_id: string | null;
  entry_count: number;
  note_count: number;
  item_count: number;
  issues: AnticipationIssue[];
  created_by: string;
  createdAt: string;
  updatedAt: string;
}

export type AnticipationItemDto = Omit<
  ItemRecord,
  | "id"
  | "quantity"
  | "value"
  | "ipi"
  | "icms_st"
  | "classification"
  | "manual_value"
  | "corrections"
> & {
  id: string;
  quantity: string | null;
  value: string | null;
  ipi: string | null;
  icms_st: string | null;
  classification: AnticipationClassification | null;
  manual_value: string | null;
  /** Correção por campo; o valor do XML continua no campo de mesmo nome. */
  corrections: Corrections;
};

export interface AnticipationHistoryDto {
  id: string;
  item_id: string | null;
  field: string;
  previous_value: string | null;
  new_value: string | null;
  reason: string | null;
  actor_user_id: string;
  created_at: string;
}

export type AnticipationBatchDetailDto = AnticipationBatchDto & {
  items: AnticipationItemDto[];
  history: AnticipationHistoryDto[];
};

const REFERRING = "fiscal.anticipations";
const CONFLICT_MESSAGE =
  "Outra importação gravou as mesmas notas ao mesmo tempo. Recarregue os lotes e tente de novo.";

const amount = (value: Amount) => (value === null ? null : value.toString());

function serializeBatch(record: BatchRecord): AnticipationBatchDto {
  return {
    id: record.id,
    client_id: record.client_id,
    competence: competenceKey(record.competence),
    file_name: record.file_name,
    status: record.status as AnticipationBatchStatus,
    responsible_id: record.responsible_id,
    reviewer_id: record.reviewer_id,
    entry_count: record.entry_count,
    note_count: record.note_count,
    item_count: record.item_count,
    issues: record.issues as AnticipationIssue[],
    created_by: record.created_by,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeItem(record: ItemRecord): AnticipationItemDto {
  return {
    id: record.id ?? "",
    entry: record.entry,
    access_key: record.access_key,
    issuer: record.issuer,
    model: record.model,
    series: record.series,
    note_number: record.note_number,
    item_number: record.item_number,
    code: record.code,
    description: record.description,
    ncm: record.ncm,
    cfop: record.cfop,
    quantity: amount(record.quantity),
    value: amount(record.value),
    ipi: amount(record.ipi),
    icms_st: amount(record.icms_st),
    classification: (record.classification ?? null) as AnticipationClassification | null,
    manual_value: money(amount(record.manual_value ?? null)),
    corrections: (record.corrections ?? {}) as Corrections,
  };
}

/** Valor monetário canônico ("7.5" → "7.50"), para comparar e registrar sem ruído. */
function money(value: string | null): string | null {
  if (value === null) return null;
  const [integer = "0", fraction = ""] = value.split(".");
  return `${integer}.${fraction.padEnd(2, "0")}`;
}

function canonicalCorrection(field: AnticipationCorrectableField, value: string): string {
  if (field === "quantity") return normalizeDecimal(value) ?? value;
  if (field === "ncm" || field === "cfop") return value;
  return money(value) ?? value;
}

/** Notas do ZIP que podem virar itens, e o motivo por arquivo das que não podem. */
function selectNotes(zipBase64: string) {
  const archive = readNfeArchive(zipBase64);
  const { notes, copies } = dropIdenticalCopies(archive.notes);
  const issues: AnticipationIssue[] = [
    ...archive.errors.map(({ entry, message }) => ({ entry, kind: "error" as const, message })),
    ...[...archive.discarded, ...copies].map(({ entry, reason }) => ({
      entry,
      kind: "discarded" as const,
      message: reason,
    })),
  ];
  const cancelledBy = new Map(archive.cancellations.map((event) => [event.access_key, event]));
  const byKey = new Map<string, NfeFile[]>();
  for (const note of notes) {
    if (!note.access_key) {
      issues.push({
        entry: note.entry,
        kind: "error",
        message: "NF-e sem chave de acesso; a antecipação exige a chave.",
      });
    } else byKey.set(note.access_key, [...(byKey.get(note.access_key) ?? []), note]);
  }

  const accepted: (NfeFile & { access_key: string })[] = [];
  for (const [key, versions] of byKey) {
    const [note] = versions;
    if (!note) continue;
    const fail = (message: string, kind: AnticipationIssue["kind"] = "error") =>
      issues.push(...versions.map(({ entry }) => ({ entry, kind, message })));
    const itemNumbers = note.items.map((item) => item.number);
    if (versions.length > 1) {
      // Duas versões diferentes da mesma nota: nenhuma é escolhida (RF-11).
      fail(
        `Chave ${key} repetida com conteúdo diferente em ${versions.map(({ entry }) => entry).join(", ")}; nenhuma versão foi importada.`,
        "duplicate",
      );
    } else if (cancelledBy.has(key)) {
      fail(`Cancelada pelo evento ${cancelledBy.get(key)?.entry}.`);
    } else if (note.protocol_status && !isAuthorizedProtocol(note.protocol_status)) {
      fail(`Protocolo com cStat ${note.protocol_status} (não autorizada).`);
    } else if (note.items.length === 0) {
      fail("NF-e sem itens.");
    } else if (new Set(itemNumbers).size !== itemNumbers.length) {
      fail("NF-e com número de item repetido.");
    } else {
      accepted.push({ ...note, access_key: key });
    }
  }
  return { entryCount: archive.entries, accepted, issues };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

export class AnticipationService {
  constructor(
    private readonly prisma: AnticipationPrisma,
    private readonly audit: { createLog(params: CreateLogParams): Promise<void> },
  ) {}

  async importBatch(
    input: ImportAnticipationBatchBody & Actor,
  ): Promise<AnticipationBatchDto & { items: AnticipationItemDto[] }> {
    const client = await this.prisma.client.findFirst({
      where: { id: input.client_id, organization_id: input.organizationId },
      select: { id: true },
    });
    if (!client) throw new ServiceError(404, "Cliente não encontrado.");

    const { entryCount, accepted, issues } = selectNotes(input.zip_base64);

    // Importações pertinentes: toda a organização, em qualquer cliente e competência. A NF-e
    // tem um único destinatário: a mesma chave em outro cliente também é colisão.
    const existing = accepted.length
      ? await this.prisma.fiscalAnticipationItem.findMany({
          where: {
            organization_id: input.organizationId,
            access_key: { in: accepted.map((note) => note.access_key) },
          },
          select: { access_key: true, item_number: true, batch_id: true },
        })
      : [];
    const importedIn = new Map(
      existing.map((row) => [`${row.access_key}|${row.item_number}`, row.batch_id]),
    );

    const rows: (ItemRecord & { organization_id: string; client_id: string })[] = [];
    const notes = new Set<string>();
    for (const note of accepted) {
      // Nota com qualquer item já importado fica inteira de fora: não divide a nota entre lotes.
      const repeated = note.items.flatMap((item) => {
        const batchId = importedIn.get(`${note.access_key}|${Number(item.number)}`);
        return batchId ? [{ item: Number(item.number), batchId }] : [];
      });
      if (repeated.length) {
        issues.push(
          ...repeated.map(({ item, batchId }) => ({
            entry: note.entry,
            kind: "duplicate" as const,
            message: `Chave ${note.access_key} item ${item} já importada no lote ${batchId}.`,
          })),
        );
        continue;
      }
      notes.add(note.access_key);
      for (const item of note.items) {
        const itemNumber = Number(item.number);
        rows.push({
          organization_id: input.organizationId,
          client_id: input.client_id,
          entry: note.entry,
          access_key: note.access_key,
          issuer: note.issuer,
          model: note.model,
          series: note.series,
          note_number: note.number,
          item_number: itemNumber,
          code: item.code,
          description: item.description,
          ncm: item.ncm,
          cfop: item.cfop,
          quantity: item.quantity,
          value: item.value,
          ipi: item.ipi,
          icms_st: item.icms_st,
        });
      }
    }

    if (rows.length === 0) {
      const shown = issues.slice(0, 5).map(({ entry, message }) => ` ${entry}: ${message}`);
      const more = issues.length > 5 ? ` E mais ${issues.length - 5} ocorrência(s).` : "";
      throw new ServiceError(400, `Nenhum item importável no ZIP.${shown.join("")}${more}`);
    }

    let batch: BatchRecord;
    try {
      batch = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.fiscalAnticipationBatch.create({
          data: {
            organization_id: input.organizationId,
            client_id: input.client_id,
            competence: competenceDate(input.competence),
            file_name: input.file_name,
            responsible_id: input.userId,
            entry_count: entryCount,
            note_count: notes.size,
            item_count: rows.length,
            issues: issues as never,
            created_by: input.userId,
          },
        });
        await transaction.fiscalAnticipationItem.createMany({
          data: rows.map((row) => ({ ...row, batch_id: created.id })) as never,
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ServiceError(409, CONFLICT_MESSAGE);
      }
      throw error;
    }

    await this.audit.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission ?? null,
      action: "Importação",
      referring: REFERRING,
      referringId: batch.id,
      changes: {
        client_id: input.client_id,
        competence: input.competence,
        item_count: rows.length,
        issue_count: issues.length,
      },
    });
    return { ...serializeBatch(batch), items: await this.items(batch.id, input.organizationId) };
  }

  private async items(batchId: string, organizationId: string): Promise<AnticipationItemDto[]> {
    const records = await this.prisma.fiscalAnticipationItem.findMany({
      where: { batch_id: batchId, organization_id: organizationId },
      orderBy: [{ entry: "asc" }, { item_number: "asc" }],
    });
    return records.map(serializeItem);
  }

  async list(
    query: ListAnticipationBatchesQuery,
    organizationId: string,
  ): Promise<{
    data: AnticipationBatchDto[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const page = query.page ?? 1;
    const { skip, take } = getPaginationParams(query);
    const where = {
      organization_id: organizationId,
      ...(query.client_id ? { client_id: query.client_id } : {}),
      ...(query.competence ? { competence: competenceDate(query.competence) } : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.fiscalAnticipationBatch.count({ where }),
      this.prisma.fiscalAnticipationBatch.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
      }),
    ]);
    return {
      data: records.map(serializeBatch),
      total,
      page,
      limit: take,
      hasMore: page * take < total,
    };
  }

  async detail(id: string, organizationId: string): Promise<AnticipationBatchDetailDto> {
    const record = await this.findBatch(id, organizationId);
    const [items, history] = await Promise.all([
      this.items(record.id, organizationId),
      this.prisma.fiscalAnticipationHistory.findMany({
        where: { batch_id: record.id, organization_id: organizationId },
        orderBy: [{ created_at: "desc" }],
      }),
    ]);
    return {
      ...serializeBatch(record),
      items,
      history: history.map((row) => ({
        id: row.id,
        item_id: row.item_id,
        field: row.field,
        previous_value: row.previous_value,
        new_value: row.new_value,
        reason: row.reason,
        actor_user_id: row.actor_user_id,
        created_at: row.created_at.toISOString(),
      })),
    };
  }

  /** Lote completo, cliente e nomes de responsável e conferente para o demonstrativo (FIS-18). */
  async demonstrative(id: string, organizationId: string): Promise<AnticipationDemonstrative> {
    const batch = await this.detail(id, organizationId);
    const ids = [batch.responsible_id, batch.reviewer_id].filter((value): value is string =>
      Boolean(value),
    );
    const [client, users] = await Promise.all([
      this.prisma.client.findFirst({
        where: { id: batch.client_id, organization_id: organizationId },
        select: { name: true, company_name: true, cpf_cnpj: true },
      }),
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    ]);
    if (!client) throw new ServiceError(404, "Cliente não encontrado.");
    return {
      batch,
      client: { name: client.company_name?.trim() || client.name, document: client.cpf_cnpj },
      people: Object.fromEntries(users.map((user) => [user.id, user.name])),
    };
  }

  private async findBatch(
    id: string,
    organizationId: string,
    client: Pick<AnticipationTransaction, "fiscalAnticipationBatch"> = this.prisma,
  ): Promise<BatchRecord> {
    const record = await client.fiscalAnticipationBatch.findFirst({
      where: { id, organization_id: organizationId },
    });
    if (!record) throw new ServiceError(404, "Lote de antecipação não encontrado.");
    return record;
  }

  /**
   * Muda o estado do lote só a partir de `from`. O UPDATE condicional trava a linha do lote até
   * o fim da transação: edições de item e transições do mesmo lote ficam em fila.
   */
  private async moveBatch(
    transaction: AnticipationTransaction,
    input: Actor & { batchId: string },
    from: AnticipationBatchStatus,
    data: { status?: AnticipationBatchStatus; reviewer_id?: string },
    where: { reviewer_id?: string } = {},
  ): Promise<void> {
    const result = await transaction.fiscalAnticipationBatch.updateMany({
      where: { id: input.batchId, organization_id: input.organizationId, status: from, ...where },
      data: { ...data, updatedAt: new Date() },
    });
    if (result.count === 1) return;
    await this.findBatch(input.batchId, input.organizationId, transaction);
    throw new ServiceError(
      409,
      from === "pending_review"
        ? "O lote não está em classificação; devolva-o antes de alterar itens."
        : "O lote não está aguardando conferência.",
    );
  }

  async updateItem(
    input: UpdateAnticipationItemBody & Actor & { batchId: string; itemId: string },
  ): Promise<AnticipationItemDto> {
    const { item, rows } = await this.prisma.$transaction(async (transaction) => {
      await this.moveBatch(transaction, input, "pending_review", {});
      const current = await transaction.fiscalAnticipationItem.findFirst({
        where: { id: input.itemId, batch_id: input.batchId, organization_id: input.organizationId },
      });
      if (!current) throw new ServiceError(404, "Item não encontrado no lote.");

      const changes: HistoryChange[] = [];
      const change = (field: string, previous: string | null, next: string | null) => {
        if (previous !== next) changes.push({ field, previous_value: previous, new_value: next });
      };
      if (input.classification !== undefined) {
        change("classification", current.classification, input.classification);
      }
      const manualValue = money(amount(current.manual_value));
      if (input.manual_value !== undefined) {
        change("manual_value", manualValue, money(input.manual_value));
      }
      const corrections = { ...((current.corrections ?? {}) as Corrections) };
      for (const field of ANTICIPATION_CORRECTABLE_FIELDS) {
        const next = input.corrections?.[field];
        if (next === undefined) continue;
        const value = next === null ? null : canonicalCorrection(field, next);
        change(`correction.${field}`, corrections[field] ?? null, value);
        if (value === null) delete corrections[field];
        else corrections[field] = value;
      }
      if (changes.length === 0) return { item: current, rows: changes };

      const updated = await transaction.fiscalAnticipationItem.update({
        where: { id: current.id },
        data: {
          ...(input.classification !== undefined ? { classification: input.classification } : {}),
          ...(input.manual_value !== undefined ? { manual_value: money(input.manual_value) } : {}),
          corrections,
        },
      });
      await transaction.fiscalAnticipationHistory.createMany({
        data: changes.map((row) => ({
          ...row,
          organization_id: input.organizationId,
          batch_id: input.batchId,
          item_id: current.id,
          reason: input.reason,
          actor_user_id: input.userId,
        })),
      });
      return { item: updated, rows: changes };
    });

    if (rows.length > 0) {
      await this.audit.createLog({
        userId: input.userId,
        organizationId: input.organizationId,
        permission: input.permission ?? null,
        action: "Revisão de item",
        referring: REFERRING,
        referringId: input.batchId,
        changes: Object.fromEntries(
          rows.map((row) => [row.field, { from: row.previous_value, to: row.new_value }]),
        ),
      });
    }
    return serializeItem(item);
  }

  private async requireReviewer(userId: string, organizationId: string): Promise<void> {
    const [permission, user] = await Promise.all([
      this.prisma.permission.findFirst({
        // Conferir é operação de escrita: conferente nível 1 receberia um lote que não conclui.
        where: {
          user_id: userId,
          organization_id: organizationId,
          fiscal: { gte: FISCAL_WRITE_PERMISSION },
        },
        select: { id: true },
      }),
      this.prisma.user.findFirst({ where: { id: userId, status: "active" }, select: { id: true } }),
    ]);
    if (!permission || !user) {
      throw new ServiceError(404, "Conferente não encontrado ou sem Fiscal nível 2 ou superior.");
    }
  }

  private async transition(
    input: Actor & { batchId: string },
    from: AnticipationBatchStatus,
    to: AnticipationBatchStatus,
    options: {
      reviewerId?: string;
      onlyReviewer?: boolean;
      reason?: string;
      validate?: (transaction: AnticipationTransaction) => Promise<void>;
    },
  ): Promise<AnticipationBatchDto> {
    const batch = await this.prisma.$transaction(async (transaction) => {
      const current = await this.findBatch(input.batchId, input.organizationId, transaction);
      // RT-02: Fiscal nível 3 autoriza no lugar do conferente (ex.: conferente ausente).
      const reviewerOnly =
        options.onlyReviewer && (input.permission ?? 0) < FISCAL_AUTHORIZE_PERMISSION;
      if (reviewerOnly && current.status === from && current.reviewer_id !== input.userId) {
        throw new ServiceError(
          403,
          "Só o conferente designado ou Fiscal nível 3 conclui a conferência.",
        );
      }
      // Trava o lote no estado de origem, valida e só então muda o estado.
      await this.moveBatch(
        transaction,
        input,
        from,
        {},
        reviewerOnly ? { reviewer_id: input.userId } : {},
      );
      await options.validate?.(transaction);
      await transaction.fiscalAnticipationBatch.updateMany({
        where: { id: input.batchId, organization_id: input.organizationId },
        data: { status: to, ...(options.reviewerId ? { reviewer_id: options.reviewerId } : {}) },
      });
      const history: HistoryChange[] = [{ field: "status", previous_value: from, new_value: to }];
      if (options.reviewerId && options.reviewerId !== current.reviewer_id) {
        history.push({
          field: "reviewer_id",
          previous_value: current.reviewer_id,
          new_value: options.reviewerId,
        });
      }
      await transaction.fiscalAnticipationHistory.createMany({
        data: history.map((row) => ({
          ...row,
          organization_id: input.organizationId,
          batch_id: input.batchId,
          item_id: null,
          reason: options.reason ?? null,
          actor_user_id: input.userId,
        })),
      });
      return this.findBatch(input.batchId, input.organizationId, transaction);
    });

    await this.audit.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission ?? null,
      action: "Revisão de lote",
      referring: REFERRING,
      referringId: input.batchId,
      changes: { status: { from, to }, reviewer_id: batch.reviewer_id },
    });
    return serializeBatch(batch);
  }

  /** Envia o lote ao conferente; exige todos os itens classificados. */
  async submit(
    input: Actor & { batchId: string; reviewer_id: string },
  ): Promise<AnticipationBatchDto> {
    await this.requireReviewer(input.reviewer_id, input.organizationId);
    return this.transition(input, "pending_review", "awaiting_check", {
      reviewerId: input.reviewer_id,
      validate: async (transaction) => {
        const pending = await transaction.fiscalAnticipationItem.count({
          where: {
            batch_id: input.batchId,
            organization_id: input.organizationId,
            classification: null,
          },
        });
        if (pending > 0) {
          throw new ServiceError(
            400,
            `Classifique todos os itens antes de enviar à conferência (${pending} pendente${pending > 1 ? "s" : ""}).`,
          );
        }
      },
    });
  }

  /** O conferente designado (ou Fiscal nível 3) aprova o lote ou o devolve com motivo. */
  async check(
    input: CheckAnticipationBatchBody & Actor & { batchId: string },
  ): Promise<AnticipationBatchDto> {
    return this.transition(
      input,
      "awaiting_check",
      input.decision === "approve" ? "checked" : "pending_review",
      { onlyReviewer: true, reason: input.reason },
    );
  }
}
