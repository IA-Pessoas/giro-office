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
  retryMaxAttempts?: number;
  retryBaseDelayMs?: number;
  maxPending?: number;
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function createAuditRecorder({
  enabled,
  serviceUrl,
  serviceToken,
  logger,
  timeoutMs = 5_000,
  maxInFlight = Number.POSITIVE_INFINITY,
  protectedCapacity = 0,
  retryMaxAttempts = 6,
  retryBaseDelayMs = 500,
  maxPending = 100,
  fetchImpl = fetch,
  sleep = defaultSleep,
  random = Math.random,
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
  let pending = 0;

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

    let tracksPending = false;
    try {
      if (!required) {
        if (pending >= maxPending) {
          logger.error({
            event: "audit.ingest.discarded",
            message: "Audit record discarded because the retry buffer is full",
            reason: "buffer_full",
            request: { id: payload.requestId },
          });
          return;
        }
        pending += 1;
        tracksPending = true;
      }
      const body = JSON.stringify(payload);
      // Required audit keeps its bounded persistence barrier; retries are best-effort only.
      const attempts = required ? 1 : retryMaxAttempts;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        let statusCode: number | undefined;
        let failure: unknown;
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
            body,
            signal: requestSignal,
          });
          requestSignal.throwIfAborted();
          if (response.ok) return;
          statusCode = response.status;
        } catch (error) {
          failure = error;
        }
        if (required) throw new Error("Audit persistence unavailable");

        const retryableStatus =
          statusCode === undefined ||
          statusCode === 408 ||
          statusCode === 425 ||
          statusCode === 429 ||
          statusCode >= 500;
        const willRetry = retryableStatus && attempt < attempts;
        const failureContext = {
          message: "Audit ingest request failed",
          request: { id: payload.requestId },
          attempt,
          willRetry,
          ...(statusCode === undefined ? {} : { http: { statusCode } }),
          ...(failure === undefined ? {} : { err: failure }),
        };
        if (willRetry) {
          logger.warn({ event: "audit.ingest.retry", ...failureContext });
        } else {
          logger.error({ event: "audit.ingest.failed", ...failureContext });
        }
        if (!willRetry) {
          logger.error({
            event: "audit.ingest.discarded",
            message: retryableStatus
              ? "Audit record discarded after retry exhaustion"
              : "Audit record discarded after a non-retryable response",
            reason: retryableStatus ? "retry_exhausted" : "non_retryable",
            request: { id: payload.requestId },
            attempts: attempt,
          });
          return;
        }
        const exponentialDelay = retryBaseDelayMs * 2 ** (attempt - 1);
        await sleep(Math.round(exponentialDelay * (0.5 + random())));
      }
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
      if (tracksPending) pending -= 1;
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
