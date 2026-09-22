export interface SupabaseStorageEnvironment {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export interface SupabaseStorageUploadOptions {
  contentType?: string;
  upsert?: boolean;
}

export interface SupabaseStorageClient {
  upload(
    bucket: string,
    path: string,
    body: BodyInit,
    options?: SupabaseStorageUploadOptions,
  ): Promise<void>;
  download(bucket: string, path: string): Promise<Response>;
  remove(bucket: string, path: string): Promise<void>;
  createSignedUrl(bucket: string, path: string, expiresIn: number): Promise<string>;
}

const encodeStoragePath = (bucket: string, path: string) =>
  [bucket, ...path.split("/")].map((segment) => encodeURIComponent(segment)).join("/");

export function createSupabaseStorageClient(
  env: SupabaseStorageEnvironment,
  fetchImpl: typeof fetch = fetch,
): SupabaseStorageClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase Storage configuration is incomplete");
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/+$/u, "");

  const headers = (contentType?: string) => {
    const requestHeaders = new Headers({
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    });

    if (contentType) requestHeaders.set("Content-Type", contentType);
    return requestHeaders;
  };

  const objectUrl = (bucket: string, path: string, action = "object") =>
    `${baseUrl}/storage/v1/${action}/${encodeStoragePath(bucket, path)}`;

  const request = async (url: string, init: RequestInit) => {
    const response = await fetchImpl(url, init);
    if (!response.ok) {
      throw new Error(`Supabase Storage request failed (${response.status})`);
    }
    return response;
  };

  return {
    async upload(bucket, path, body, options = {}) {
      const requestHeaders = headers(options.contentType);
      if (options.upsert !== undefined) requestHeaders.set("x-upsert", String(options.upsert));

      await request(objectUrl(bucket, path), {
        method: "POST",
        headers: requestHeaders,
        body,
      });
    },

    download(bucket, path) {
      return request(objectUrl(bucket, path), {
        method: "GET",
        headers: headers(),
      });
    },

    async remove(bucket, path) {
      await request(objectUrl(bucket, path), {
        method: "DELETE",
        headers: headers(),
      });
    },

    async createSignedUrl(bucket, path, expiresIn) {
      const requestHeaders = headers();
      requestHeaders.set("Content-Type", "application/json");
      const response = await request(objectUrl(bucket, path, "object/sign"), {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({ expiresIn }),
      });

      const payload = (await response.json()) as { signedURL?: unknown; signedUrl?: unknown };
      const signedUrl = payload.signedURL ?? payload.signedUrl;
      if (typeof signedUrl !== "string") {
        throw new Error("Supabase Storage response did not include a signed URL");
      }

      try {
        return new URL(signedUrl, `${baseUrl}/`).toString();
      } catch {
        throw new Error("Supabase Storage response contained an invalid signed URL");
      }
    },
  };
}
