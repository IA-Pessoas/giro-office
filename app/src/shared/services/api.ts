import { createApiClient } from "@workspace/api";
import { parseCookies } from "nookies";
import { toast } from "react-toastify";

import { AuthTokenError } from "./errors/AuthTokenError";
import { notifyServerError } from "./serverErrorToast";

const TOKEN_COOKIE = "cw.token";

export function setupAPIClient(ctx = undefined, onUnauthorized?: () => void) {
  return createApiClient({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3010",
    getAccessToken: () => {
      const cookies = parseCookies(ctx);
      return cookies[TOKEN_COOKIE];
    },
    onUnauthorized,
    getUnauthorizedErrorForSsr: () => new AuthTokenError(),
    onServerError: () => {
      notifyServerError(toast);
    },
  });
}
