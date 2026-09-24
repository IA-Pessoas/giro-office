import type { ServiceBinding } from "@workspace/runtime";
import {
  type AuditRecorder,
  type CreateAuditRequestPayload,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";

interface ReportsAuditRecorderOptions {
  enabled?: boolean;
  service?: ServiceBinding;
  serviceUrl?: string;
  serviceToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isTimeout(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "TimeoutError") ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}

function endpoint(options: ReportsAuditRecorderOptions): string | undefined {
  if (options.service) return "https://audit-service.internal/internal/audit/requests";
  if (!options.serviceUrl?.trim()) return undefined;
  try {
    return new URL("/internal/audit/requests", options.serviceUrl).toString();
  } catch (error) {
    throw new ServiceError(503, "Endpoint da auditoria externa inválido.", error);
  }
}

export function createReportsAuditRecorder(options: ReportsAuditRecorderOptions): AuditRecorder {
  if (options.enabled === false) return async () => {};

  const url = endpoint(options);
  if (!url) throw new ServiceError(503, "Auditoria externa não configurada.");

  const send = options.service
    ? options.service.fetch.bind(options.service)
    : (options.fetchImpl ?? fetch);

  return async (payload: CreateAuditRequestPayload): Promise<void> => {
    const timeout = AbortSignal.timeout(Math.max(1, options.timeoutMs ?? 5_000));
    try {
      const response = await send(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: options.serviceToken ?? "",
        },
        body: JSON.stringify(payload),
        signal: timeout,
      });
      if (!response.ok) {
        throw new ServiceError(503, `Auditoria externa retornou HTTP ${response.status}.`);
      }
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (isTimeout(error)) {
        throw new ServiceError(504, "Tempo limite da auditoria externa excedido.", error);
      }
      throw new ServiceError(503, "Auditoria externa indisponível.", error);
    }
  };
}
