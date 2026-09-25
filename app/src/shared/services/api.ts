import { createApiClient } from "@workspace/api";
import { toast } from "./toast.ts";

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

type GatewayBinding = { fetch(request: Request): Promise<Response> };

// Mesmo contexto que getCloudflareContext() do @opennextjs/cloudflare le. Fora do Worker
// (next dev, standalone) nao existe, e o SSR segue em API_INTERNAL_URL.
const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

export function getWorkerGateway(): GatewayBinding | undefined {
  const context = (globalThis as Record<symbol, { env?: { GATEWAY?: GatewayBinding } }>)[
    cloudflareContextSymbol
  ];
  return context?.env?.GATEWAY;
}

export function setupAPIClient(
  ctx?: ApiServerContext,
  onUnauthorized?: () => void,
  onCsrfFailure?: () => void,
  // false quando a tela já explica a falha (ex.: consulta opcional de CNPJ).
  { notifyServerErrors = true }: { notifyServerErrors?: boolean } = {},
) {
  const gateway = ctx ? getWorkerGateway() : undefined;
  const api = createApiClient({
    baseURL: gateway
      ? // Host ignorado: o Service Binding entrega direto ao giro-gateway, que roteia pelo path.
        "https://giro-gateway"
      : ctx
        ? process.env.API_INTERNAL_URL || "http://127.0.0.1:3010"
        : process.env.NEXT_PUBLIC_API_URL || "/api",
    cookieHeader: ctx?.req?.headers?.cookie,
    getCsrfToken: () => readBrowserCookie("cw.csrf"),
    onUnauthorized,
    onCsrfFailure,
    getUnauthorizedErrorForSsr: () => new AuthTokenError(),
    onServerError: notifyServerErrors
      ? (error) => {
          notifyServerError(toast, error);
        }
      : undefined,
  });

  if (gateway) {
    api.defaults.adapter = "fetch";
    api.defaults.env = {
      ...api.defaults.env,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => gateway.fetch(new Request(input, init)),
    };
  }

  return api;
}

export const platformApi = setupAPIClient();
