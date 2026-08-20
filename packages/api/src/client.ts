import axios, { type AxiosError, type AxiosInstance } from "axios";

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
  onServerError?: () => void;
}

export function createApiClient(options: CreateApiClientOptions): AxiosInstance {
  const { baseURL, cookieHeader, getCsrfToken, onUnauthorized, getUnauthorizedErrorForSsr, onServerError } =
    options;
  const api = axios.create({ baseURL, withCredentials: true });

  api.interceptors.request.use((config) => {
    if (cookieHeader && cookieHeader.length <= 8192) {
      config.headers.Cookie = cookieHeader;
    }

    const method = config.method?.toUpperCase();
    if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
      const csrfToken = getCsrfToken?.()?.trim();
      if (csrfToken && csrfToken.length <= 256) {
        config.headers["x-csrf-token"] = csrfToken;
      }
    }

    return config;
  });

  api.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        if (typeof window !== "undefined") {
          onUnauthorized?.();
        } else if (getUnauthorizedErrorForSsr) {
          return Promise.reject(getUnauthorizedErrorForSsr());
        }
      }

      const status = error.response?.status;
      if (typeof window !== "undefined" && status !== undefined && status >= 500) {
        onServerError?.();
      }

      return Promise.reject(error);
    },
  );

  return api;
}
