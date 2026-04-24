import type { ErrorRequestHandler, Request } from "express";

import type { Logger } from "../logger/index.js";
import { serializeError } from "./errors.js";

interface CreateExpressErrorHandlerOptions {
  logger: Logger;
  event: string;
  fallbackMessage: string;
  getContext?: (request: Request) => Record<string, unknown> | undefined;
}

type RequestWithLogger = Request & {
  log?: Logger;
  requestId?: string;
};

export function createExpressErrorHandler({
  logger,
  event,
  fallbackMessage,
  getContext,
}: CreateExpressErrorHandlerOptions): ErrorRequestHandler {
  return function expressErrorHandler(error, request, response, next) {
    if (response.headersSent) {
      next(error);
      return;
    }

    const requestWithLogger = request as RequestWithLogger;
    const requestLogger = requestWithLogger.log ?? logger;
    const serialized = serializeError(error, {
      requestId: requestWithLogger.requestId,
      fallbackMessage,
    });

    requestLogger.error({
      event,
      message: serialized.body.error,
      ...getContext?.(request),
      err: error,
    });

    response.status(serialized.statusCode).json(serialized.body);
  };
}
