import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type {
  DeletePhotosByPrefixOptions,
  SupabasePhotoUploadOptions,
  UploadableFile,
} from "./supabase-photo.js";
export { deletePhotosByPrefix, uploadPhoto } from "./supabase-photo.js";

export type { SupabaseClient };

export function createSupabaseServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey);
}
