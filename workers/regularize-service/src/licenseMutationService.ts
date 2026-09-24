import type {
  CreateLicenseBody,
  UpdateLicenseBody,
} from "@workspace/regularize-service/src/schemas/license.schemas.js";
import { getLicenseNotificationDateRange } from "@workspace/regularize-service/src/schemas/status.schemas.js";
import { ServiceError } from "@workspace/shared";
import type { RegularizeWorkerEnv } from "./env.js";
import {
  isLicenseProtocolObjectPath,
  LICENSE_PROTOCOL_SIGNED_URL_EXPIRES_IN_SECONDS,
  type LicenseProtocolUploadFile,
  WorkerLicenseProtocolStorage,
  type WorkerLicenseProtocolStorageLike,
} from "./licenseProtocolStorage.js";

export type LicenseRow = Record<string, unknown> & { organization_id: string };

export type LicenseMutationPrisma = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  license: {
    findFirst(args: Record<string, unknown>): Promise<LicenseRow | null>;
    create(args: Record<string, unknown>): Promise<LicenseRow>;
    update(args: Record<string, unknown>): Promise<LicenseRow>;
  };
};

export type LicenseMutationService = {
  create(input: {
    organizationId: string;
    userId: string;
    body: CreateLicenseBody;
  }): Promise<Record<string, unknown>>;
  update(input: {
    organizationId: string;
    userId: string;
    body: UpdateLicenseBody;
  }): Promise<Record<string, unknown>>;
  replaceProtocol(input: {
    organizationId: string;
    userId: string;
    licenseId: string;
    file: LicenseProtocolUploadFile;
  }): Promise<Record<string, unknown>>;
  createProtocolAccess(input: {
    organizationId: string;
    licenseId: string;
  }): Promise<{ url: string; expires_in_seconds: number }>;
};

const select = {
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
  protocol_file_path: true,
  protocol_file_original_name: true,
  protocol_file_mime_type: true,
  protocol_file_size_bytes: true,
  protocol_file_uploaded_at: true,
};

function publicLicense(row: LicenseRow): Record<string, unknown> {
  const {
    organization_id: _organizationId,
    protocol_file_path: protocolFilePath,
    protocol_file_original_name: originalName,
    protocol_file_mime_type: mimeType,
    protocol_file_size_bytes: sizeBytes,
    protocol_file_uploaded_at: uploadedAt,
    ...license
  } = row;
  return protocolFilePath
    ? {
        ...license,
        protocol_file: {
          original_name: originalName,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          uploaded_at: uploadedAt,
        },
      }
    : license;
}

function requireRow(
  prisma: LicenseMutationPrisma,
): (query: TemplateStringsArray, ...values: unknown[]) => Promise<void> {
  return async (query, ...values) => {
    const rows = await prisma.$queryRaw<{ id: string }[]>(query, ...values);
    if (rows.length === 0) throw new ServiceError(404, "Recurso não encontrado.");
  };
}

async function recordLog(
  prisma: LicenseMutationPrisma,
  input: {
    userId: string;
    organizationId: string;
    action: string;
    referringId: string;
    changes: unknown;
  },
): Promise<void> {
  await prisma.$executeRaw`INSERT INTO "logs" ("id", "user_id", "action", "referring", "referring_id", "changes", "organization_id") VALUES (${crypto.randomUUID()}, ${input.userId}, ${input.action}, ${"regularize.license"}, ${input.referringId}, ${JSON.stringify(input.changes)}::jsonb, ${input.organizationId})`;
}

async function reconcileLicenseNotification(
  prisma: LicenseMutationPrisma,
  organizationId: string,
  licenseId: string,
): Promise<void> {
  const range = getLicenseNotificationDateRange();
  const rows = await prisma.$queryRaw<
    { id: string; type_license: string; due_date: Date; client_name: string }[]
  >`SELECT l."id", l."type_license", l."due_date", c."name" AS "client_name"
     FROM "regularize.license" l
     JOIN "clients" c ON c."id" = l."client_id"
    WHERE l."id" = ${licenseId}
      AND l."organization_id" = ${organizationId}
      AND c."organization_id" = ${organizationId}
      AND c."status" = ${"Ativo"}
      AND l."due_date" >= ${range.gte}
      AND l."due_date" < ${range.lt}`;
  if (rows.length === 0) return;

  const managers = await prisma.$queryRaw<{ user_id: string }[]>`SELECT p."user_id"
      FROM "permissions" p
      JOIN "users" u ON u."id" = p."user_id"
     WHERE p."organization_id" = ${organizationId}
       AND p."regularize" = 2
       AND u."status" IN (${"Ativo"}, ${"active"})`;
  const license = rows[0];
  if (!license) return;
  const title = `ALVARA A VENCER: ${license.type_license}`;
  const message = `O alvara do cliente ${license.client_name} vence em ${license.due_date.toLocaleDateString("pt-BR", { timeZone: "UTC" })}.`;
  const referenceDate = range.gte;
  for (const manager of managers) {
    await prisma.$executeRaw`INSERT INTO "notification.regularize" ("id", "user_id", "regarding", "regarding_id", "title", "message", "reference_date", "organization_id") VALUES (${crypto.randomUUID()}, ${manager.user_id}, ${"regularize.license"}, ${license.id}, ${title}, ${message}, ${referenceDate}, ${organizationId}) ON CONFLICT ("organization_id", "user_id", "regarding", "regarding_id", "title", "reference_date") DO NOTHING`;
  }
}

async function ensureReferences(
  prisma: LicenseMutationPrisma,
  organizationId: string,
  body: { client_id?: string; task_id?: string; responsible_id?: string },
  currentResponsibleId?: string | null,
): Promise<void> {
  if (body.client_id) {
    await requireRow(
      prisma,
    )`SELECT "id" FROM "clients" WHERE "id" = ${body.client_id} AND "organization_id" = ${organizationId} LIMIT 1`;
  }
  if (body.task_id) {
    await requireRow(
      prisma,
    )`SELECT "id" FROM "integracao.tasks" WHERE "id" = ${body.task_id} AND "organization_id" = ${organizationId} LIMIT 1`;
  }
  if (body.responsible_id && body.responsible_id !== currentResponsibleId) {
    await requireRow(prisma)`SELECT u."id"
        FROM "users" u
        LEFT JOIN "departments" d ON d."id" = u."department_id"
        JOIN "permissions" p ON p."user_id" = u."id" AND p."organization_id" = ${organizationId}
       WHERE u."id" = ${body.responsible_id}
         AND u."status" IN (${"Ativo"}, ${"active"})
         AND (u."organization_id" = ${organizationId} OR (u."organization_id" IS NULL AND d."organization_id" = ${organizationId}))
         AND p."regularize" > 0
       LIMIT 1`;
  }
}

function normalizeError(error: unknown, fallback: string): never {
  if (error instanceof ServiceError) throw error;
  throw new ServiceError(500, fallback, error);
}

export function createLicenseMutationService(
  prisma: LicenseMutationPrisma,
  env: RegularizeWorkerEnv,
  protocolStorage?: WorkerLicenseProtocolStorageLike,
): LicenseMutationService {
  const storage = protocolStorage ?? WorkerLicenseProtocolStorage.fromEnv(env);

  return {
    async create(input) {
      try {
        await ensureReferences(prisma, input.organizationId, input.body);
        const duplicate = await prisma.license.findFirst({
          where: {
            organization_id: input.organizationId,
            protocol: input.body.protocol,
            client_id: input.body.client_id ?? null,
          },
          select: { id: true },
        });
        if (duplicate) throw new ServiceError(409, "Alvara com este protocolo ja cadastrado.");
        const created = await prisma.license.create({
          data: { ...input.body, organization_id: input.organizationId },
          select,
        });
        await recordLog(prisma, {
          userId: input.userId,
          organizationId: input.organizationId,
          action: "Cadastro",
          referringId: String(created.id),
          changes: {},
        });
        await reconcileLicenseNotification(prisma, input.organizationId, String(created.id));
        return publicLicense(created);
      } catch (error) {
        return normalizeError(error, "Erro ao criar licença do Regularize.");
      }
    },

    async update(input) {
      try {
        const existing = await prisma.license.findFirst({
          where: { id: input.body.id, organization_id: input.organizationId },
          select,
        });
        if (!existing) throw new ServiceError(404, "Alvara nao encontrado.");
        await ensureReferences(
          prisma,
          input.organizationId,
          input.body,
          String(existing.responsible_id ?? ""),
        );
        const { id: _id, ...data } = input.body;
        const updated = await prisma.license.update({
          where: { id: input.body.id },
          data: { ...data, observation: input.body.observation ?? null },
          select,
        });
        await recordLog(prisma, {
          userId: input.userId,
          organizationId: input.organizationId,
          action: "Atualizacao",
          referringId: input.body.id,
          changes: { old: publicLicense(existing), new: publicLicense(updated) },
        });
        await reconcileLicenseNotification(prisma, input.organizationId, input.body.id);
        return publicLicense(updated);
      } catch (error) {
        return normalizeError(error, "Erro ao atualizar licença do Regularize.");
      }
    },

    async replaceProtocol(input) {
      if (!storage) throw new ServiceError(503, "Armazenamento de protocolos não configurado.");
      const existing = await prisma.license.findFirst({
        where: { id: input.licenseId, organization_id: input.organizationId },
        select: { id: true, protocol_file_path: true },
      });
      if (!existing) throw new ServiceError(404, "Alvará não encontrado.");
      const objectPath = await storage.upload(input);
      if (!isLicenseProtocolObjectPath(objectPath, input.organizationId, input.licenseId)) {
        await storage.deleteObject(objectPath).catch(() => undefined);
        throw new ServiceError(500, "Storage retornou uma chave de protocolo inválida.");
      }
      try {
        const uploadedAt = new Date();
        await prisma.license.update({
          where: { id: input.licenseId },
          data: {
            protocol_file_path: objectPath,
            protocol_file_original_name: input.file.originalname,
            protocol_file_mime_type: input.file.mimetype,
            protocol_file_size_bytes: input.file.size,
            protocol_file_uploaded_at: uploadedAt,
          },
          select,
        });
        await recordLog(prisma, {
          userId: input.userId,
          organizationId: input.organizationId,
          action: existing.protocol_file_path
            ? "Substituição de protocolo"
            : "Cadastro de protocolo",
          referringId: input.licenseId,
          changes: { mime_type: input.file.mimetype, size_bytes: input.file.size },
        });
        if (existing.protocol_file_path && existing.protocol_file_path !== objectPath) {
          await storage.deleteObject(String(existing.protocol_file_path)).catch(() => undefined);
        }
        return {
          original_name: input.file.originalname,
          mime_type: input.file.mimetype,
          size_bytes: input.file.size,
          uploaded_at: uploadedAt,
        };
      } catch (error) {
        await storage.deleteObject(objectPath).catch(() => undefined);
        return normalizeError(error, "Erro ao persistir protocolo da licença.");
      }
    },

    async createProtocolAccess(input) {
      if (!storage) throw new ServiceError(503, "Armazenamento de protocolos não configurado.");
      const license = await prisma.license.findFirst({
        where: { id: input.licenseId, organization_id: input.organizationId },
        select: { protocol_file_path: true },
      });
      if (!license) throw new ServiceError(404, "Alvará não encontrado.");
      const objectPath = String(license.protocol_file_path ?? "");
      if (!objectPath) throw new ServiceError(404, "Protocolo da licença não encontrado.");
      if (!isLicenseProtocolObjectPath(objectPath, input.organizationId, input.licenseId)) {
        throw new ServiceError(500, "Chave armazenada do protocolo é inválida.");
      }
      return {
        url: await storage.createSignedAccessUrl(objectPath),
        expires_in_seconds: LICENSE_PROTOCOL_SIGNED_URL_EXPIRES_IN_SECONDS,
      };
    },
  };
}
