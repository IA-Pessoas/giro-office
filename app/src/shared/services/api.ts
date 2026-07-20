import { createApiClient } from "@workspace/api";
import { parseCookies } from "nookies";
import { toast } from "react-toastify";

import { AuthTokenError } from "./errors/AuthTokenError";

const TOKEN_COOKIE = "cw.token";

const SERVER_ERROR_TOAST_MESSAGE =
  "Não foi possível concluir a operação. Tente de novo daqui a pouco.";

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
      toast.error(SERVER_ERROR_TOAST_MESSAGE, {
        toastId: "shared-server-error",
      });
    },
  });
}
