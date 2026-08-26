import { INTERNAL_SERVICE_TOKEN_HEADER } from "../http/headers.js";
import type { Logger } from "../logger/index.js";
import type {
  AuditReservation,
  CreateAuditRequestPayload,
  ReservableAuditRecorder,
} from "./types.js";

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
  maxInFlight = Number.POSITIVE_INFINITY,
  protectedCapacity = 0,
  fetchImpl = fetch,
}: CreateAuditRecorderOptions): ReservableAuditRecorder {
  if (!enabled) {
    return Object.assign(async () => {}, {
      reserve: (kind: AuditReservation) => kind,
      recordRequired: async () => {
        throw new Error("Audit persistence unavailable");
      },
    });
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

  const send = async (
    payload: CreateAuditRequestPayload,
    reservation?: AuditReservation,
    required = false,
    signal?: AbortSignal,
  ): Promise<void> => {
    const isPublic = reservation ? reservation === "public" : !required;
    const atCapacity = inFlight >= safeMaxInFlight || (isPublic && publicInFlight >= publicLimit);

    if (!reservation && atCapacity) {
      logger.warn({
        event: "audit.ingest.dropped",
        message: "Audit ingest concurrency limit reached",
        request: { id: payload.requestId },
      });
      if (required) throw new Error("Audit persistence unavailable");
      return;
    }

    if (!reservation) {
      inFlight += 1;
      if (isPublic) {
        publicInFlight += 1;
      }
    }

    try {
      const timeout = AbortSignal.timeout(Math.max(1, timeoutMs));
      const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      requestSignal.throwIfAborted();
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: serviceToken,
        },
        body: JSON.stringify(payload),
        signal: requestSignal,
      });
      requestSignal.throwIfAborted();

      if (response.ok) {
        return;
      }

      if (required) throw new Error("Audit persistence unavailable");

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
        err: required ? new Error("Audit persistence unavailable") : error,
      });
      if (required) throw new Error("Audit persistence unavailable");
    } finally {
      inFlight -= 1;
      if (isPublic) {
        publicInFlight -= 1;
      }
    }
  };

  const record: ReservableAuditRecorder = (payload, reservation) => send(payload, reservation);
  record.recordRequired = (payload, reservation, signal) =>
    send(payload, reservation, true, signal);

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
