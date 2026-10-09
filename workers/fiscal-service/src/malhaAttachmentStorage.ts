import {
  MALHA_ATTACHMENT_DEFAULT_BUCKET,
  type MalhaAttachmentStorage,
} from "@workspace/fiscal-service/src/services/malhaService.js";
import { createSupabaseStorageClient, type SupabaseStorageClient } from "@workspace/runtime";
import { ServiceError } from "@workspace/shared/http";

import type { FiscalWorkerEnv } from "./env.js";

/** Mesmo bucket privado do serviço Node, via REST do Supabase Storage. */
export class WorkerMalhaAttachmentStorage implements MalhaAttachmentStorage {
  constructor(
    private readonly storage: SupabaseStorageClient,
    private readonly bucket: string,
  ) {}

  static fromEnv(env: FiscalWorkerEnv): WorkerMalhaAttachmentStorage | undefined {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return undefined;
    return new WorkerMalhaAttachmentStorage(
      createSupabaseStorageClient({
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      }),
      env.FISCAL_MALHA_ATTACHMENT_BUCKET ?? MALHA_ATTACHMENT_DEFAULT_BUCKET,
    );
  }

  async upload(objectPath: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.assertPrivateBucket();
    await this.storage.upload(this.bucket, objectPath, new Blob([bytes], { type: contentType }), {
      contentType,
      upsert: false,
    });
  }

  remove(objectPath: string): Promise<void> {
    return this.storage.remove(this.bucket, objectPath);
  }

  async createSignedUrl(objectPath: string, expiresInSeconds: number): Promise<string> {
    await this.assertPrivateBucket();
    return this.storage.createSignedUrl(this.bucket, objectPath, expiresInSeconds);
  }

  private async assertPrivateBucket(): Promise<void> {
    const bucket = await this.storage.getBucket(this.bucket);
    if (bucket.public) {
      throw new ServiceError(500, "Storage privado de anexos fiscais não configurado.");
    }
  }
}
