import axios, { type AxiosError, type AxiosInstance } from "axios";

export interface CreateApiClientOptions {
  baseURL: string;
  getAccessToken?: () => string | undefined;
  onUnauthorized?: () => void;
  /** When set, non-browser 401 responses reject with this error (e.g. SSR). */
  getUnauthorizedErrorForSsr?: () => Error;
  /** Browser only: chamado em respostas HTTP 5xx (ex.: toast genérico). */
  onServerError?: () => void;
}

export function createApiClient(options: CreateApiClientOptions): AxiosInstance {
  const { baseURL, getAccessToken, onUnauthorized, getUnauthorizedErrorForSsr, onServerError } =
    options;
  const api = axios.create({ baseURL });

  api.interceptors.request.use((config) => {
    const token = getAccessToken?.();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
