import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const requestId = String(request.headers["x-request-id"] ?? randomUUID());
  request.requestId = requestId;
  response.setHeader("x-request-id", requestId);
  next();
}
