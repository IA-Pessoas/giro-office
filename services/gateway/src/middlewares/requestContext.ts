import { randomUUID } from "node:crypto";

import type { Logger } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

export function buildRequestContextMiddleware(logger: Logger) {
  return function requestContext(request: Request, response: Response, next: NextFunction): void {
    const requestId = String(request.headers["x-request-id"] ?? randomUUID());

    request.requestId = requestId;
    request.log = logger.child({
      request: {
        id: requestId,
        method: request.method,
        path: request.path,
        ip: request.ip || undefined,
      },
    });
    response.setHeader("x-request-id", requestId);

    next();
  };
}
