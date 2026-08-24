import { INTERNAL_SERVICE_TOKEN_HEADER } from "../http/headers.js";
import type { Logger } from "../logger/index.js";
import type { AuditRecorder, CreateAuditRequestPayload } from "./types.js";

interface CreateAuditRecorderOptions {
  enabled: boolean;
  serviceUrl: string;
  serviceToken: string;
  logger: Logger;
  timeoutMs?: number;
  maxInFlight?: number;
  fetchImpl?: typeof fetch;
}

export function createAuditRecorder({
  enabled,
  serviceUrl,
  serviceToken,
  logger,
  timeoutMs = 5_000,
  maxInFlight = 100,
  fetchImpl = fetch,
}: CreateAuditRecorderOptions): AuditRecorder {
  if (!enabled) {
    return Object.assign(async () => {}, { reserve: () => true });
  }

  const url = new URL("/internal/audit/requests", serviceUrl);
  const safeMaxInFlight = Math.max(1, Math.floor(maxInFlight));
  let inFlight = 0;

  const record: AuditRecorder = async (payload: CreateAuditRequestPayload, reserved = false) => {
    if (!reserved && inFlight >= safeMaxInFlight) {
      logger.warn({
        event: "audit.ingest.dropped",
        message: "Audit ingest concurrency limit reached",
        request: { id: payload.requestId },
      });
      return;
    }

    if (!reserved) {
      inFlight += 1;
    }

    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: serviceToken,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
      });

      if (response.ok) {
        return;
      }

      logger.warn({
        event: "audit.ingest.failed",
        message: "Audit ingest request failed",
        request: {
          id: payload.requestId,
        },
        http: {
          statusCode: response.status,
        },
      });
    } catch (error) {
      logger.error({
        event: "audit.ingest.failed",
        message: "Audit ingest request failed",
        request: {
          id: payload.requestId,
        },
        err: error,
      });
    } finally {
      inFlight -= 1;
    }
  };

  record.reserve = (): boolean => {
    if (inFlight >= safeMaxInFlight) {
      return false;
    }

    inFlight += 1;
    return true;
  };

  return record;
}
