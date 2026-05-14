const DEFAULT_USER_SERVICE_URL = "http://localhost:3030";

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/g, "");
}

function getUserServiceBaseUrl(): string {
  return trimTrailingSlashes(
    process.env.NEXT_PUBLIC_USER_SERVICE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      DEFAULT_USER_SERVICE_URL,
  );
}

export function resolvePhotoUrl(photoUrl: string | null | undefined): string | null {
  if (!photoUrl || photoUrl.trim().length === 0) {
    return null;
  }

  if (/^https?:\/\//i.test(photoUrl)) {
    return photoUrl;
  }

  const normalizedPath = photoUrl.replace(/\\/g, "/").trim();
  const cleanPath = trimSlashes(normalizedPath);
  const userServiceBaseUrl = getUserServiceBaseUrl();

  if (cleanPath.startsWith("users/")) {
    return `${userServiceBaseUrl}/uploads/${cleanPath}`;
  }

  if (cleanPath.startsWith("uploads/")) {
    return `${userServiceBaseUrl}/${cleanPath}`;
  }

  if (cleanPath.startsWith("user/uploads/")) {
    return `${userServiceBaseUrl}/${cleanPath.slice("user/".length)}`;
  }

  return `${userServiceBaseUrl}/${cleanPath}`;
}
