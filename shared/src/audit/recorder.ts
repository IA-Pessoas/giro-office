import { ServiceError } from "../http/errors.js";
import { INTERNAL_SERVICE_TOKEN_HEADER } from "../http/headers.js";
import type { Logger } from "../logger/index.js";
import type { AuditRecorder, AuditReservation, CreateAuditRequestPayload } from "./types.js";

interface CreateAuditRecorderOptions {
  enabled: boolean;
  serviceUrl: string;
  serviceToken: string;
  logger: Logger;
  timeoutMs?: number;
  maxInFlight?: number;
  protectedCapacity?: number;
  fetchImpl?: typeof fetch;
}

export function createAuditRecorder({
  enabled,
  serviceUrl,
  serviceToken,
  logger,
  timeoutMs = 5_000,
  maxInFlight = 100,
  protectedCapacity = 0,
  fetchImpl = fetch,
}: CreateAuditRecorderOptions): AuditRecorder {
  if (!enabled) {
    return Object.assign(async () => {}, { reserve: (kind: AuditReservation) => kind });
  }

  const url = new URL("/internal/audit/requests", serviceUrl);
  const safeMaxInFlight = Math.max(1, Math.floor(maxInFlight));
  const safeProtectedCapacity = Math.min(
    safeMaxInFlight,
    Math.max(0, Math.floor(protectedCapacity)),
  );
  const publicLimit = safeMaxInFlight - safeProtectedCapacity;
  let inFlight = 0;
  let publicInFlight = 0;

  const record: AuditRecorder = async (
    payload: CreateAuditRequestPayload,
    reservation?: AuditReservation,
  ) => {
    const isPublic = reservation !== "protected";
    const atCapacity = inFlight >= safeMaxInFlight || (isPublic && publicInFlight >= publicLimit);

    if (!reservation && atCapacity) {
      if (payload.method === "ENTITY_CHANGE") {
        throw new ServiceError(503, "Auditoria indisponível; alteração não confirmada.");
      }

      logger.warn({
        event: "audit.ingest.dropped",
        message: "Audit ingest concurrency limit reached",
        request: { id: payload.requestId },
      });
      return;
    }

    if (!reservation) {
      inFlight += 1;
      if (isPublic) {
        publicInFlight += 1;
      }
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
      if (isPublic) {
        publicInFlight -= 1;
      }
    }
  };

  record.reserve = (kind: AuditReservation): AuditReservation | undefined => {
    if (inFlight >= safeMaxInFlight || (kind === "public" && publicInFlight >= publicLimit)) {
      return undefined;
    }

    inFlight += 1;
    if (kind === "public") {
      publicInFlight += 1;
    }
    return kind;
  };

  return record;
}
