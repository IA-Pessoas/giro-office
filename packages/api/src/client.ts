import axios, { type AxiosError, type AxiosInstance } from "axios";

const REFRESH_MARKER_PREFIX = "cw.session-refresh.";
const REFRESH_MARKER_TTL_MS = 5_000;
const REFRESH_WAIT_TIMEOUT_MS = 1_000;
const REFRESH_POLL_INTERVAL_MS = 20;

export interface CreateApiClientOptions {
  baseURL: string;
  /** Raw request cookie header used only while rendering on the server. */
  cookieHeader?: string;
  /** Browser-readable CSRF token. The signed session remains HttpOnly. */
  getCsrfToken?: () => string | undefined;
  onUnauthorized?: () => void;
  /** When set, non-browser 401 responses reject with this error (e.g. SSR). */
  getUnauthorizedErrorForSsr?: () => Error;
  /** Browser only: chamado em respostas HTTP 5xx (ex.: toast genérico). */
  onServerError?: (error: AxiosError) => void;
  /** Browser only: chamado quando o gateway rejeita a sessão por CSRF inválido. */
  onCsrfFailure?: () => void;
}

// POST /user/session e o proprio login: 401 ali e credencial invalida, nao sessao expirada.
function isLoginAttempt(error: AxiosError): boolean {
  return (
    error.config?.method?.toUpperCase() === "POST" &&
    !!error.config.url?.split(/[?#]/u, 1)[0]?.endsWith("/user/session")
  );
}

function isCsrfFailure(error: AxiosError): boolean {
  const data = error.response?.data;
  return (
    error.response?.status === 403 &&
    !!data &&
    typeof data === "object" &&
    (data as { error?: unknown }).error === "Requisição não autorizada."
  );
}

export function createApiClient(options: CreateApiClientOptions): AxiosInstance {
  const {
    baseURL,
    cookieHeader,
    getCsrfToken,
    onUnauthorized,
    getUnauthorizedErrorForSsr,
    onServerError,
    onCsrfFailure,
  } = options;
  const api = axios.create({ baseURL, withCredentials: true });
  const csrfSnapshots = new WeakMap<object, string | undefined>();
  const refreshSettlers = new WeakMap<object, () => void>();
  const pendingRefreshes = new Set<Promise<void>>();

  function getBrowserStorage(): Storage | undefined {
    if (typeof window === "undefined") {
      return undefined;
    }
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  }

  function createRefreshMarker(): string | undefined {
    const storage = getBrowserStorage();
    if (!storage) {
      return undefined;
    }
    const id = globalThis.crypto?.randomUUID?.();
    if (!id) {
      return undefined;
    }
    const key = `${REFRESH_MARKER_PREFIX}${id}`;
    try {
      storage.setItem(key, String(Date.now() + REFRESH_MARKER_TTL_MS));
      return key;
    } catch {
      return undefined;
    }
  }

  function hasActiveRefreshMarker(): boolean {
    const storage = getBrowserStorage();
    if (!storage) {
      return false;
    }
    const now = Date.now();
    try {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (!key?.startsWith(REFRESH_MARKER_PREFIX)) {
          continue;
        }
        const expiresAt = Number(storage.getItem(key));
        if (!Number.isFinite(expiresAt) || expiresAt <= now) {
          storage.removeItem(key);
          continue;
        }
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  async function waitForRefreshes(): Promise<void> {
    const deadline = Date.now() + REFRESH_WAIT_TIMEOUT_MS;
    const observedAtStart = pendingRefreshes.size > 0 || hasActiveRefreshMarker();
    let observedRefresh = observedAtStart;
    while (observedRefresh && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, REFRESH_POLL_INTERVAL_MS));
      observedRefresh = pendingRefreshes.size > 0 || hasActiveRefreshMarker();
    }
    if (!observedAtStart) {
      await new Promise((resolve) => setTimeout(resolve, REFRESH_POLL_INTERVAL_MS));
    }
  }

  function trackRefresh(config: object, method: string | undefined, url: string | undefined): void {
    if (method !== "POST" || !url?.split(/[?#]/u, 1)[0]?.endsWith("/user/session/refresh")) {
      return;
    }

    let resolveRefresh = (): void => undefined;
    const pendingRefresh = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const marker = createRefreshMarker();
    pendingRefreshes.add(pendingRefresh);
    refreshSettlers.set(config, () => {
      pendingRefreshes.delete(pendingRefresh);
      if (marker) {
        try {
          getBrowserStorage()?.removeItem(marker);
        } catch {
          // The marker expires automatically if browser storage becomes unavailable.
        }
      }
      resolveRefresh();
    });
  }

  function settleRefresh(config: object | undefined): void {
    if (!config) {
      return;
    }
    const settle = refreshSettlers.get(config);
    refreshSettlers.delete(config);
    settle?.();
  }

  api.interceptors.request.use((config) => {
    if (cookieHeader && cookieHeader.length <= 8192) {
      config.headers.Cookie = cookieHeader;
    }

    const csrfToken = getCsrfToken?.()?.trim();
    csrfSnapshots.set(config, csrfToken);
    const method = config.method?.toUpperCase();
    trackRefresh(config, method, config.url);
    if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
      if (csrfToken && csrfToken.length <= 256) {
        config.headers["x-csrf-token"] = csrfToken;
      }
    }

    return config;
  });

  api.interceptors.response.use(
    (response) => {
      settleRefresh(response.config);
      return response;
    },
    (error: AxiosError) => {
      settleRefresh(error.config);
      if (typeof window !== "undefined" && isCsrfFailure(error)) {
        onCsrfFailure?.();
      }
      if (error.response?.status === 401) {
        if (typeof window !== "undefined") {
          if (isLoginAttempt(error)) return Promise.reject(error);
          onUnauthorized?.();
        } else if (getUnauthorizedErrorForSsr) {
          return Promise.reject(getUnauthorizedErrorForSsr());
        }
      }

      if (
        typeof window !== "undefined" &&
        error.response?.status === 409 &&
        error.response.headers["x-auth-session-state"] === "superseded"
      ) {
        return waitForRefreshes().then(() => {
          const requestCsrf = error.config ? csrfSnapshots.get(error.config) : undefined;
          const currentCsrf = getCsrfToken?.()?.trim();
          if (requestCsrf && currentCsrf && requestCsrf === currentCsrf) {
            onUnauthorized?.();
          }
          return Promise.reject(error);
        });
      }

      const status = error.response?.status;
      if (typeof window !== "undefined" && status !== undefined && status >= 500) {
        onServerError?.(error);
      }

      return Promise.reject(error);
    },
  );

  return api;
}
