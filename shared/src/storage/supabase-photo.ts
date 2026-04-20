import type { SupabaseClient } from "@supabase/supabase-js";

import { ServiceError } from "../http/errors.js";
import { error as logError } from "../logger/index.js";

export interface SupabasePhotoUploadOptions {
  bucket?: string;
  upsert?: boolean;
}

export interface UploadableFile {
  buffer: Buffer;
  mimetype: string;
}

const DEFAULT_BUCKET = "Fotos";

/**
 * Faz upload de uma foto para o Supabase Storage e retorna a URL pública.
 * @param supabase - Cliente Supabase (criado em cada serviço)
 * @param filePath - Caminho do arquivo (ex: "users/123/photo.jpg", "organizations/456/logo.png")
 * @param file - Arquivo com buffer e mimetype (ex: request.file do multer)
 * @param options - Bucket e upsert (opcional)
 */
export async function uploadPhoto(
  supabase: SupabaseClient,
  filePath: string,
  file: UploadableFile,
  options?: SupabasePhotoUploadOptions,
): Promise<string> {
  const bucket = options?.bucket ?? DEFAULT_BUCKET;
  const upsert = options?.upsert ?? true;

  try {
    const { error } = await supabase.storage.from(bucket).upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert,
    });

    if (error) {
      logError("Supabase storage upload error", { err: error });
      throw new ServiceError(500, "Erro ao fazer upload da foto.");
    }

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  } catch (err: unknown) {
    if (err instanceof ServiceError) throw err;
    logError("Erro inesperado no upload de foto", { err });
    throw new ServiceError(500, "Erro ao fazer upload da foto.", err);
  }
}

export interface DeletePhotosByPrefixOptions {
  bucket?: string;
}

/**
 * Remove todos os arquivos em um prefixo do bucket (ex: "users/123" remove tudo em users/123/).
 * @param supabase - Cliente Supabase
 * @param prefix - Prefixo do caminho (ex: "users/123", "organizations/456")
 * @param options - Bucket (opcional)
 */
export async function deletePhotosByPrefix(
  supabase: SupabaseClient,
  prefix: string,
  options?: DeletePhotosByPrefixOptions,
): Promise<void> {
  const bucket = options?.bucket ?? DEFAULT_BUCKET;

  try {
    const { data: files } = await supabase.storage.from(bucket).list(prefix);

    if (!files || files.length === 0) return;

    const paths = files.map((f) => `${prefix}/${f.name}`);

    const { error } = await supabase.storage.from(bucket).remove(paths);

    if (error) {
      logError("Supabase storage delete error", { err: error });
      throw new ServiceError(500, "Erro ao remover foto.");
    }
  } catch (err: unknown) {
    if (err instanceof ServiceError) throw err;
    logError("Erro inesperado ao remover foto", { err });
    throw new ServiceError(500, "Erro ao remover foto.", err);
  }
}
