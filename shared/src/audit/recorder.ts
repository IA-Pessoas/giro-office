import { INTERNAL_SERVICE_TOKEN_HEADER } from "../http/headers.js";
import type { Logger } from "../logger/index.js";
import type { AuditRecorder, CreateAuditRequestPayload } from "./types.js";

interface CreateAuditRecorderOptions {
  enabled: boolean;
  serviceUrl: string;
  serviceToken: string;
  logger: Logger;
  retryMaxAttempts?: number;
  retryBaseDelayMs?: number;
  maxPending?: number;
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
}

const DEFAULT_RETRY_MAX_ATTEMPTS = 6;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_MAX_PENDING = 100;

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function createAuditRecorder({
  enabled,
  serviceUrl,
  serviceToken,
  logger,
  retryMaxAttempts = DEFAULT_RETRY_MAX_ATTEMPTS,
  retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
  maxPending = DEFAULT_MAX_PENDING,
  fetchImpl = fetch,
  sleep = defaultSleep,
  random = Math.random,
}: CreateAuditRecorderOptions): AuditRecorder {
  if (!enabled) {
    return async () => {};
  }

  const url = new URL("/internal/audit/requests", serviceUrl);
  let pending = 0;

  return async (payload: CreateAuditRequestPayload) => {
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
    try {
      for (let attempt = 1; attempt <= retryMaxAttempts; attempt += 1) {
        let statusCode: number | undefined;
        let failure: unknown;
        try {
          const response = await fetchImpl(url, {
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
          statusCode = response.status;
        } catch (error) {
          failure = error;
        }

        const retryableStatus =
          statusCode === undefined ||
          statusCode === 408 ||
          statusCode === 425 ||
          statusCode === 429 ||
          statusCode >= 500;
        const willRetry = retryableStatus && attempt < retryMaxAttempts;
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
        const jitteredDelay = Math.round(exponentialDelay * (0.5 + random()));
        await sleep(jitteredDelay);
      }
    } finally {
      pending -= 1;
    }
  };
}
