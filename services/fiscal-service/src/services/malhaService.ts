import { ServiceError } from "@workspace/shared/http";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLogParams } from "../integrations/audit.js";
import { competenceDate, competenceKey } from "../schemas/competence.schemas.js";
import type {
  CreateMalhaBody,
  ListMalhasQuery,
  UpdateMalhaBody,
} from "../schemas/malha.schemas.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";

// Sem imports Node no topo: o Worker fiscal reaproveita este serviço como está.

type MalhaTransaction = Pick<PrismaClient, "fiscalMalha" | "fiscalMalhaHistory">;

export type MalhaPrisma = Pick<
  PrismaClient,
  "client" | "task" | "user" | "permission" | "fiscalMalha" | "fiscalMalhaHistory"
> & {
  $transaction<T>(callback: (transaction: MalhaTransaction) => Promise<T>): Promise<T>;
};

/** Storage privado do anexo; cada runtime (Express/Worker) fornece seu adaptador Supabase. */
export interface MalhaAttachmentStorage {
  upload(objectPath: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(objectPath: string): Promise<void>;
  createSignedUrl(objectPath: string, expiresInSeconds: number): Promise<string>;
}

export const MALHA_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const MALHA_ATTACHMENT_SIGNED_URL_EXPIRES_IN_SECONDS = 300;
export const MALHA_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const EXTENSIONS_BY_MIME_TYPE: Record<MalhaAttachmentMimeType, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

type MalhaAttachmentMimeType = (typeof MALHA_ATTACHMENT_MIME_TYPES)[number];

export interface MalhaAttachmentFile {
  bytes: Uint8Array;
  mimetype: string;
  originalname: string;
  size: number;
}

const REFERRING = "fiscal.malhas";
const TRACKED_FIELDS = ["deadline", "status", "responsible_id"] as const;
type TrackedField = (typeof TRACKED_FIELDS)[number];

interface Actor {
  organizationId: string;
  userId: string;
  permission?: number;
}

type MalhaRecord = {
  id: string;
  client_id: string;
  period_start: Date;
  period_end: Date;
  reason: string;
  deadline: Date | null;
  status: string;
  responsible_id: string | null;
  task_id: string | null;
  attachment_path: string | null;
  attachment_original_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  attachment_uploaded_at: Date | null;
  created_by: string;
  updated_by: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface MalhaDto {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  reason: string;
  deadline: string | null;
  status: string;
  responsible_id: string | null;
  task_id: string | null;
  attachment: {
    original_name: string;
    mime_type: string;
    size_bytes: number;
    uploaded_at: string;
  } | null;
  created_by: string;
  updated_by: string;
  createdAt: string;
  updatedAt: string;
}

export interface MalhaHistoryDto {
  id: string;
  field: TrackedField;
  previous_value: string | null;
  new_value: string | null;
  actor_user_id: string;
  created_at: string;
}

const dateKey = (date: Date | null): string | null => date?.toISOString().slice(0, 10) ?? null;
const parseDate = (value: string | null | undefined): Date | null | undefined =>
  value === undefined ? undefined : value === null ? null : new Date(`${value}T00:00:00.000Z`);

function serialize(record: MalhaRecord): MalhaDto {
  return {
    id: record.id,
    client_id: record.client_id,
    period_start: competenceKey(record.period_start),
    period_end: competenceKey(record.period_end),
    reason: record.reason,
    deadline: dateKey(record.deadline),
    status: record.status,
    responsible_id: record.responsible_id,
    task_id: record.task_id,
    attachment:
      record.attachment_path &&
      record.attachment_original_name &&
      record.attachment_mime_type &&
      record.attachment_size_bytes !== null &&
      record.attachment_uploaded_at
        ? {
            original_name: record.attachment_original_name,
            mime_type: record.attachment_mime_type,
            size_bytes: record.attachment_size_bytes,
            uploaded_at: record.attachment_uploaded_at.toISOString(),
          }
        : null,
    created_by: record.created_by,
    updated_by: record.updated_by,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function trackedValues(record: {
  deadline: Date | null;
  status: string;
  responsible_id: string | null;
}): Record<TrackedField, string | null> {
  return {
    deadline: dateKey(record.deadline),
    status: record.status,
    responsible_id: record.responsible_id,
  };
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function hasValidSignature(bytes: Uint8Array, mimetype: MalhaAttachmentMimeType): boolean {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...Array.from(bytes.subarray(start, end)));
  if (mimetype === "application/pdf") return ascii(0, 5) === "%PDF-";
  if (mimetype === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mimetype === "image/png") {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  return bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}

/** Valida tamanho, tipo, extensão e assinatura binária do anexo da malha. */
export function validateMalhaAttachment(
  file: MalhaAttachmentFile | undefined,
): MalhaAttachmentFile & { mimetype: MalhaAttachmentMimeType } {
  if (!file || file.size === 0 || file.bytes.length === 0) {
    throw new ServiceError(400, "Arquivo do anexo é obrigatório.");
  }
  if (file.size > MALHA_ATTACHMENT_MAX_SIZE_BYTES) {
    throw new ServiceError(400, "Anexo excede o limite de 10 MB.");
  }
  if (!(MALHA_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    throw new ServiceError(400, "Formato do anexo não permitido.");
  }
  const mimetype = file.mimetype as MalhaAttachmentMimeType;
  const dot = file.originalname.lastIndexOf(".");
  const extension = dot >= 0 ? file.originalname.slice(dot).toLowerCase() : "";
  if (!EXTENSIONS_BY_MIME_TYPE[mimetype].includes(extension)) {
    throw new ServiceError(400, "Extensão do anexo não corresponde ao formato informado.");
  }
  if (!hasValidSignature(file.bytes, mimetype)) {
    throw new ServiceError(400, "Assinatura do arquivo não corresponde ao tipo informado.");
  }
  return { ...file, mimetype };
}

function attachmentObjectPath(
  organizationId: string,
  malhaId: string,
  mimetype: MalhaAttachmentMimeType,
): string {
  const extension = EXTENSIONS_BY_MIME_TYPE[mimetype][0];
  return `fiscal/organizations/${organizationId}/malhas/${malhaId}/${crypto.randomUUID()}${extension}`;
}

/** Malhas fiscais por cliente: prazo, situação e responsável com histórico na mesma transação. */
export class MalhaService {
  constructor(
    private readonly prisma: MalhaPrisma,
    private readonly audit: { createLog(params: CreateLogParams): Promise<void> },
    private readonly storage?: MalhaAttachmentStorage,
  ) {}

  private async requireClient(clientId: string, organizationId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!client) throw new ServiceError(404, "Cliente não encontrado.");
  }

  private async requireTask(taskId: string, organizationId: string): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organization_id: organizationId },
      select: { id: true },
    });
    if (!task) throw new ServiceError(404, "Tarefa não encontrada na organização.");
  }

  private async requireResponsible(userId: string, organizationId: string): Promise<void> {
    const [permission, user] = await Promise.all([
      this.prisma.permission.findFirst({
        where: { user_id: userId, organization_id: organizationId, fiscal: { gt: 0 } },
        select: { id: true },
      }),
      this.prisma.user.findFirst({ where: { id: userId, status: "active" }, select: { id: true } }),
    ]);
    if (!permission || !user) {
      throw new ServiceError(404, "Responsável não encontrado ou sem acesso ao Fiscal.");
    }
  }

  private async findOwned(id: string, organizationId: string): Promise<MalhaRecord> {
    const record = await this.prisma.fiscalMalha.findFirst({
      where: { id, organization_id: organizationId },
    });
    if (!record) throw new ServiceError(404, "Malha não encontrada.");
    return record;
  }

  private historyRows(
    malhaId: string,
    actor: Actor,
    before: Record<TrackedField, string | null> | null,
    after: Record<TrackedField, string | null>,
  ) {
    return TRACKED_FIELDS.filter((field) =>
      before ? before[field] !== after[field] : after[field] !== null,
    ).map((field) => ({
      organization_id: actor.organizationId,
      malha_id: malhaId,
      field,
      previous_value: before?.[field] ?? null,
      new_value: after[field],
      actor_user_id: actor.userId,
    }));
  }

  async create(input: CreateMalhaBody & Actor): Promise<MalhaDto> {
    await this.requireClient(input.client_id, input.organizationId);
    if (input.task_id) await this.requireTask(input.task_id, input.organizationId);
    if (input.responsible_id) {
      await this.requireResponsible(input.responsible_id, input.organizationId);
    }

    const created = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.fiscalMalha.create({
        data: {
          organization_id: input.organizationId,
          client_id: input.client_id,
          period_start: competenceDate(input.period_start),
          period_end: competenceDate(input.period_end),
          reason: input.reason,
          deadline: parseDate(input.deadline) ?? null,
          status: input.status,
          responsible_id: input.responsible_id ?? null,
          task_id: input.task_id ?? null,
          created_by: input.userId,
          updated_by: input.userId,
        },
      });
      const rows = this.historyRows(record.id, input, null, trackedValues(record));
      if (rows.length > 0) await transaction.fiscalMalhaHistory.createMany({ data: rows });
      return record;
    });

    await this.audit.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission ?? null,
      action: "Cadastro",
      referring: REFERRING,
      referringId: created.id,
      changes: { client_id: input.client_id, status: created.status },
    });
    return serialize(created);
  }

  async update(input: UpdateMalhaBody & Actor & { id: string }): Promise<MalhaDto> {
    const current = await this.findOwned(input.id, input.organizationId);
    const periodStart = input.period_start ?? competenceKey(current.period_start);
    const periodEnd = input.period_end ?? competenceKey(current.period_end);
    if (periodStart > periodEnd) throw new ServiceError(400, "Período inválido.");
    if (input.task_id && input.task_id !== current.task_id) {
      await this.requireTask(input.task_id, input.organizationId);
    }
    if (input.responsible_id && input.responsible_id !== current.responsible_id) {
      await this.requireResponsible(input.responsible_id, input.organizationId);
    }

    const { updated, changes } = await this.prisma.$transaction(async (transaction) => {
      const before = await transaction.fiscalMalha.findFirst({
        where: { id: current.id, organization_id: input.organizationId },
      });
      if (!before) throw new ServiceError(404, "Malha não encontrada.");
      const record = await transaction.fiscalMalha.update({
        where: { id: before.id },
        data: {
          ...(input.period_start ? { period_start: competenceDate(input.period_start) } : {}),
          ...(input.period_end ? { period_end: competenceDate(input.period_end) } : {}),
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
          ...(input.deadline !== undefined ? { deadline: parseDate(input.deadline) } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.responsible_id !== undefined ? { responsible_id: input.responsible_id } : {}),
          ...(input.task_id !== undefined ? { task_id: input.task_id } : {}),
          updated_by: input.userId,
        },
      });
      const rows = this.historyRows(record.id, input, trackedValues(before), trackedValues(record));
      if (rows.length > 0) await transaction.fiscalMalhaHistory.createMany({ data: rows });
      return {
        updated: record,
        changes: Object.fromEntries(
          rows.map((row) => [row.field, { from: row.previous_value, to: row.new_value }]),
        ),
      };
    });

    await this.audit.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission ?? null,
      action: "Atualização",
      referring: REFERRING,
      referringId: updated.id,
      changes,
    });
    return serialize(updated);
  }

  async list(
    query: ListMalhasQuery,
    organizationId: string,
  ): Promise<{ data: MalhaDto[]; total: number; page: number; limit: number; hasMore: boolean }> {
    const page = query.page ?? 1;
    const { skip, take } = getPaginationParams(query);
    const where = {
      organization_id: organizationId,
      ...(query.client_id ? { client_id: query.client_id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.responsible_id ? { responsible_id: query.responsible_id } : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.fiscalMalha.count({ where }),
      this.prisma.fiscalMalha.findMany({
        where,
        orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        skip,
        take,
      }),
    ]);
    return {
      data: records.map(serialize),
      total,
      page,
      limit: take,
      hasMore: page * take < total,
    };
  }

  async detail(
    id: string,
    organizationId: string,
  ): Promise<MalhaDto & { history: MalhaHistoryDto[] }> {
    const record = await this.findOwned(id, organizationId);
    const history = await this.prisma.fiscalMalhaHistory.findMany({
      where: { malha_id: record.id, organization_id: organizationId },
      orderBy: [{ created_at: "desc" }],
    });
    return {
      ...serialize(record),
      history: history.map((row) => ({
        id: row.id,
        field: row.field as TrackedField,
        previous_value: row.previous_value,
        new_value: row.new_value,
        actor_user_id: row.actor_user_id,
        created_at: row.created_at.toISOString(),
      })),
    };
  }

  private requireStorage(): MalhaAttachmentStorage {
    if (!this.storage) throw new ServiceError(503, "Storage de anexos fiscais não configurado.");
    return this.storage;
  }

  async replaceAttachment(
    input: Actor & { id: string; file: MalhaAttachmentFile | undefined },
  ): Promise<MalhaDto> {
    const storage = this.requireStorage();
    const file = validateMalhaAttachment(input.file);
    const current = await this.findOwned(input.id, input.organizationId);
    const objectPath = attachmentObjectPath(input.organizationId, current.id, file.mimetype);
    await storage.upload(objectPath, file.bytes, file.mimetype);

    let updated: MalhaRecord;
    try {
      updated = await this.prisma.fiscalMalha.update({
        where: { id: current.id },
        data: {
          attachment_path: objectPath,
          attachment_original_name: file.originalname,
          attachment_mime_type: file.mimetype,
          attachment_size_bytes: file.size,
          attachment_uploaded_at: new Date(),
          attachment_uploaded_by: input.userId,
          updated_by: input.userId,
        },
      });
    } catch (error) {
      await storage.remove(objectPath).catch(() => undefined);
      throw error;
    }
    if (current.attachment_path)
      await storage.remove(current.attachment_path).catch(() => undefined);

    await this.audit.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission ?? null,
      action: current.attachment_path ? "Substituição de anexo" : "Cadastro de anexo",
      referring: REFERRING,
      referringId: current.id,
      changes: { mime_type: file.mimetype, size_bytes: file.size },
    });
    return serialize(updated);
  }

  async attachmentAccess(
    id: string,
    organizationId: string,
  ): Promise<{ url: string; expires_in_seconds: number }> {
    const storage = this.requireStorage();
    const record = await this.findOwned(id, organizationId);
    const prefix = `fiscal/organizations/${organizationId}/malhas/${record.id}/`;
    if (!record.attachment_path) throw new ServiceError(404, "Malha sem anexo.");
    if (!record.attachment_path.startsWith(prefix)) {
      throw new ServiceError(500, "Chave armazenada do anexo é inválida.");
    }
    return {
      url: await storage.createSignedUrl(
        record.attachment_path,
        MALHA_ATTACHMENT_SIGNED_URL_EXPIRES_IN_SECONDS,
      ),
      expires_in_seconds: MALHA_ATTACHMENT_SIGNED_URL_EXPIRES_IN_SECONDS,
    };
  }
}
