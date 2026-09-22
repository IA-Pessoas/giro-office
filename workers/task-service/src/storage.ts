import { createSupabaseStorageClient } from "@workspace/runtime";
import { ServiceError } from "@workspace/shared/http";
import {
  buildTaskAttachmentObjectPath,
  type TaskAttachmentStorage,
} from "@workspace/task-service/src/services/taskAttachmentStorage.js";
import type { TaskWorkerEnv } from "./env.js";

const SIGNED_URL_EXPIRES_IN_SECONDS = 300;
const UNAVAILABLE = "Anexos indisponíveis no momento. Tente novamente mais tarde.";

type StorageEnv = Pick<
  TaskWorkerEnv,
  "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "TASK_ATTACHMENT_STORAGE_BUCKET"
>;

/**
 * O `SupabaseTaskAttachmentStorage` do Node sobre o client de Storage do runtime (os
 * Workers não usam supabase-js): mesmo caminho de objeto, bucket privado verificado,
 * mesmas mensagens e status.
 */
export function createTaskAttachmentStorage(
  env: StorageEnv,
  {
    fetchImpl = fetch,
    createAttachmentId = () => crypto.randomUUID(),
  }: { fetchImpl?: typeof fetch; createAttachmentId?: () => string } = {},
): TaskAttachmentStorage {
  const bucket = env.TASK_ATTACHMENT_STORAGE_BUCKET ?? "";
  let bucketVerification: Promise<void> | undefined;

  function client() {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !bucket) {
      throw new ServiceError(503, UNAVAILABLE);
    }
    return createSupabaseStorageClient(
      { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY },
      fetchImpl,
    );
  }

  async function ensurePrivateBucket() {
    bucketVerification ??= client()
      .getBucket(bucket)
      .then(
        ({ public: isPublic }) => {
          if (isPublic) throw new ServiceError(503, UNAVAILABLE);
        },
        (error: unknown) => {
          throw new ServiceError(503, UNAVAILABLE, error);
        },
      );
    try {
      await bucketVerification;
    } catch (error) {
      bucketVerification = undefined;
      throw error;
    }
  }

  return {
    async upload(input) {
      await ensurePrivateBucket();
      const objectPath = buildTaskAttachmentObjectPath({
        organizationId: input.organizationId,
        taskId: input.taskId,
        attachmentId: createAttachmentId(),
        mimetype: input.file.mimetype,
      });
      try {
        await client().upload(bucket, objectPath, new Uint8Array(input.file.buffer), {
          contentType: input.file.mimetype,
          upsert: false,
        });
        return objectPath;
      } catch (error) {
        throw new ServiceError(500, "Erro ao armazenar anexo da tarefa.", error);
      }
    },
    async createSignedAccessUrl(objectPath) {
      await ensurePrivateBucket();
      try {
        return await client().createSignedUrl(bucket, objectPath, SIGNED_URL_EXPIRES_IN_SECONDS);
      } catch (error) {
        throw new ServiceError(500, "Erro ao gerar link do anexo da tarefa.", error);
      }
    },
    async remove(objectPath) {
      const storage = client();
      try {
        await storage.remove(bucket, objectPath);
      } catch (error) {
        throw new ServiceError(500, "Erro ao remover objeto do anexo da tarefa.", error);
      }
    },
  };
}
