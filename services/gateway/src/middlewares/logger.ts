import type { NextFunction, Request, Response } from "express";

export function requestLogger(request: Request, response: Response, next: NextFunction): void {
  const startedAt = Date.now();

  response.on("finish", () => {
    const elapsedMs = Date.now() - startedAt;

    console.log(
      JSON.stringify({
        type: "http_request",
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        elapsedMs
      })
    );
  });

  next();
}
