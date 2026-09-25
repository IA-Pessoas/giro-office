import fs from "node:fs/promises";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { error as logError, ServiceError } from "@workspace/shared";

export type CertificateFileKind = "pj" | "pf";

export interface BuildCertificateObjectPathInput {
  organizationId: string;
  kind: CertificateFileKind;
  certificateId: string;
  originalName: string;
  timestamp?: number;
}

export interface PutCertificateFileObjectInput {
  path: string;
  buffer: Buffer;
  contentType: string;
}

export interface CertificateFileStorage {
  putObject(input: PutCertificateFileObjectInput): Promise<void>;
  getObject(path: string): Promise<Buffer>;
  deleteObject(path: string): Promise<void>;
}

function safeFileName(originalName: string): string {
  return originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function resolveInsideBaseDir(baseDir: string, objectPath: string): string {
  const basePath = path.resolve(baseDir);
  const fullPath = path.resolve(basePath, objectPath);

  if (fullPath !== basePath && !fullPath.startsWith(`${basePath}${path.sep}`)) {
    throw new ServiceError(400, "Caminho de arquivo de certificado inválido.");
  }

  return fullPath;
}

export function buildCertificateObjectPath(input: BuildCertificateObjectPathInput): string {
  const prefix = input.kind === "pj" ? "certificate-pj" : "certificate-pf";
  const timestamp = input.timestamp ?? Date.now();

  return `organizations/${input.organizationId}/${prefix}/${input.certificateId}/${timestamp}_${safeFileName(input.originalName)}.enc`;
}

export class LocalCertificateFileStorage implements CertificateFileStorage {
  constructor(private readonly baseDir: string) {}

  async putObject(input: PutCertificateFileObjectInput): Promise<void> {
    const fullPath = resolveInsideBaseDir(this.baseDir, input.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.buffer);
  }

  async getObject(objectPath: string): Promise<Buffer> {
    try {
      return await fs.readFile(resolveInsideBaseDir(this.baseDir, objectPath));
    } catch (err: unknown) {
      if (err instanceof ServiceError) {
        throw err;
      }
      logError("Erro ao ler arquivo local de certificado", { err });
      throw new ServiceError(404, "Arquivo de certificado não encontrado.", err);
    }
  }

  async deleteObject(objectPath: string): Promise<void> {
    await fs.rm(resolveInsideBaseDir(this.baseDir, objectPath), { force: true });
  }
}

export class SupabaseCertificateFileStorage implements CertificateFileStorage {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket: string,
  ) {}

  async putObject(input: PutCertificateFileObjectInput): Promise<void> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(input.path, input.buffer, {
        contentType: input.contentType,
        upsert: true,
      });

    if (error) {
      logError("Erro no upload do certificado para Supabase", { err: error });
      throw new ServiceError(500, "Erro ao armazenar arquivo de certificado.", error);
    }
  }

  async getObject(objectPath: string): Promise<Buffer> {
    const { data, error } = await this.supabase.storage.from(this.bucket).download(objectPath);

    if (error || !data) {
      logError("Erro ao baixar certificado do Supabase", { err: error });
      throw new ServiceError(404, "Arquivo de certificado não encontrado.", error);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  async deleteObject(objectPath: string): Promise<void> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([objectPath]);

    if (error) {
      logError("Erro ao remover certificado do Supabase", { err: error });
      throw new ServiceError(500, "Erro ao remover arquivo de certificado.", error);
    }
  }
}
