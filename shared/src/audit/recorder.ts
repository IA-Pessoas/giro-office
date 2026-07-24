import { INTERNAL_SERVICE_TOKEN_HEADER } from "../http/headers.js";
import type { Logger } from "../logger/index.js";
import type { AuditRecorder, CreateAuditRequestPayload } from "./types.js";

interface CreateAuditRecorderOptions {
  enabled: boolean;
  serviceUrl: string;
  serviceToken: string;
  logger: Logger;
}

export function createAuditRecorder({
  enabled,
  serviceUrl,
  serviceToken,
  logger,
}: CreateAuditRecorderOptions): AuditRecorder {
  if (!enabled) {
    return async () => {};
  }

  const url = new URL("/internal/audit/requests", serviceUrl);

  return async (payload: CreateAuditRequestPayload) => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: serviceToken,
        },
        body: JSON.stringify(payload),
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
    }
  };
}
