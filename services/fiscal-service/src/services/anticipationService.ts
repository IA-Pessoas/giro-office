import { ServiceError } from "@workspace/shared/http";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLogParams } from "../integrations/audit.js";
import type {
  AnticipationBatchStatus,
  ImportAnticipationBatchBody,
  ListAnticipationBatchesQuery,
} from "../schemas/anticipation.schemas.js";
import { competenceDate, competenceKey } from "../schemas/competence.schemas.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import {
  dropIdenticalCopies,
  isAuthorizedProtocol,
  type NfeFile,
  readNfeArchive,
} from "./nfeXml.js";

// Sem imports Node no topo: o Worker fiscal reaproveita este serviço como está.

/**
 * Antecipações (E3, FIS-16): importa ZIP de XML NF-e num lote por cliente e competência, com os
 * itens rastreáveis até o arquivo de origem. Não calcula imposto (RF-13): a revisão é manual.
 */

type AnticipationTransaction = Pick<
  PrismaClient,
  "fiscalAnticipationBatch" | "fiscalAnticipationItem"
>;

export type AnticipationPrisma = Pick<
  PrismaClient,
  "client" | "fiscalAnticipationBatch" | "fiscalAnticipationItem"
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
};

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
  "id" | "quantity" | "value" | "ipi" | "icms_st"
> & {
  id: string;
  quantity: string | null;
  value: string | null;
  ipi: string | null;
  icms_st: string | null;
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
  };
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

    // Importações pertinentes: as do mesmo cliente na organização, em qualquer competência.
    const existing = accepted.length
      ? await this.prisma.fiscalAnticipationItem.findMany({
          where: {
            organization_id: input.organizationId,
            client_id: input.client_id,
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
      for (const item of note.items) {
        const itemNumber = Number(item.number);
        const batchId = importedIn.get(`${note.access_key}|${itemNumber}`);
        if (batchId) {
          issues.push({
            entry: note.entry,
            kind: "duplicate",
            message: `Chave ${note.access_key} item ${itemNumber} já importada no lote ${batchId}.`,
          });
          continue;
        }
        notes.add(note.access_key);
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
      const detail = issues
        .slice(0, 5)
        .map(({ entry, message }) => `${entry}: ${message}`)
        .join(" ");
      throw new ServiceError(400, `Nenhum item importável no ZIP.${detail ? ` ${detail}` : ""}`);
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
      if ((error as { code?: unknown } | null)?.code === "P2002") {
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

  async detail(
    id: string,
    organizationId: string,
  ): Promise<AnticipationBatchDto & { items: AnticipationItemDto[] }> {
    const record = await this.prisma.fiscalAnticipationBatch.findFirst({
      where: { id, organization_id: organizationId },
    });
    if (!record) throw new ServiceError(404, "Lote de antecipação não encontrado.");
    return { ...serializeBatch(record), items: await this.items(record.id, organizationId) };
  }
}
