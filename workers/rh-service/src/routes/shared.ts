import type { WorkerAuthContext } from "@workspace/runtime";
import { ServiceError } from "@workspace/shared/http";
import type { Context, Hono } from "hono";
import type { RhWorkerEnv } from "../env.js";
import type { PrismaClient } from "../prisma.js";

export type RhDb = PrismaClient;
export type RhWorkerContext = { Bindings: RhWorkerEnv; Variables: { auth: WorkerAuthContext } };
export type RhContext = Context<RhWorkerContext>;
export type RhApp = Hono<RhWorkerContext>;

/** Permissões do módulo RH, iguais às do serviço Node (`requireRhPermission.ts`). */
export const RH_SELF_SERVICE_PERMISSION = 1;
export const RH_WORKFLOW_MESSAGE_PERMISSION = 2;
export const RH_MANAGEMENT_PERMISSION = 3;

export interface RhRouteDeps {
  /** Executa o callback com um client Prisma por requisição (Hyperdrive) ou o fake do teste. */
  withDb<T>(c: RhContext, callback: (db: RhDb) => Promise<T>): Promise<T>;
  env(c: RhContext): RhWorkerEnv;
}

export async function jsonBody(c: RhContext): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "JSON inválido.");
  }
}

/** Nível RH repassado pelo gateway (`x-auth-permission` = modules.rh para `/rh`). */
export function rhPermissionLevel(auth: WorkerAuthContext): number {
  return typeof auth.claims.permission === "number" ? auth.claims.permission : 0;
}

export function canManageRh(auth: WorkerAuthContext): boolean {
  return rhPermissionLevel(auth) >= RH_MANAGEMENT_PERMISSION;
}

/** Equivalente a `getSingleTrimmedQueryValue` do Express: string vazia vira undefined. */
export function trimmedQuery(c: RhContext, name: string): string | undefined {
  const value = c.req.query(name)?.trim();
  return value ? value : undefined;
}

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? `${megabytes} MB` : `${bytes} bytes`;
}

/**
 * Equivalente a `createPhotoUploadMiddleware(...).single(field)` do Node (multer em memória),
 * com as mesmas mensagens e status. Retorna undefined quando o campo não vem.
 */
export async function uploadedFile(
  c: RhContext,
  field: string,
  options: { allowedMimeTypes: readonly string[]; maxSizeBytes: number },
): Promise<UploadedFile | undefined> {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new ServiceError(400, "Upload de arquivo inválido.");
  }
  const value = form.get(field);
  if (!(value instanceof File)) return undefined;
  if (!options.allowedMimeTypes.includes(value.type)) {
    throw new ServiceError(400, "Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.");
  }
  if (value.size > options.maxSizeBytes) {
    throw new ServiceError(413, `A imagem deve ter no máximo ${formatSize(options.maxSizeBytes)}.`);
  }
  return {
    buffer: Buffer.from(await value.arrayBuffer()),
    mimetype: value.type,
    originalname: value.name,
    size: value.size,
  };
}
