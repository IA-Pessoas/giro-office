import { createApiClient } from "@workspace/api";
import { toast } from "react-toastify";

import { AuthTokenError } from "./errors/AuthTokenError";
import { notifyServerError } from "./serverErrorToast";

type ApiServerContext = {
  req?: { headers?: { cookie?: string } };
};

export function readBrowserCookie(name: string): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  const prefix = `${name}=`;
  const encodedValue = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);

  if (!encodedValue || encodedValue.length > 256) {
    return undefined;
  }

  try {
    return decodeURIComponent(encodedValue);
  } catch {
    return undefined;
  }
}

export function setupAPIClient(
  ctx?: ApiServerContext,
  onUnauthorized?: () => void,
  onCsrfFailure?: () => void,
) {
  return createApiClient({
    baseURL: ctx
      ? process.env.API_INTERNAL_URL || "http://127.0.0.1:3010"
      : process.env.NEXT_PUBLIC_API_URL || "/api",
    cookieHeader: ctx?.req?.headers?.cookie,
    getCsrfToken: () => readBrowserCookie("cw.csrf"),
    onUnauthorized,
    onCsrfFailure,
    getUnauthorizedErrorForSsr: () => new AuthTokenError(),
    onServerError: () => {
      notifyServerError(toast);
    },
  });
}

export const platformApi = setupAPIClient();
