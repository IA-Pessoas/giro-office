import { REQUEST_ID_HEADER, ServiceError, serializeError } from "@workspace/shared/http";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function errorResponse(error: unknown, requestId?: string): Response {
  const serialized = serializeError(error, {
    requestId,
    fallbackMessage: "Erro interno no user-service.",
  });
  return Response.json(serialized.body, { status: serialized.statusCode });
}

export function handleError(error: unknown, c: Context): Response {
  return errorResponse(error, c.req.header(REQUEST_ID_HEADER));
}

export function notFoundResponse(): Response {
  return errorResponse(new ServiceError(404, "Recurso não encontrado."));
}

export function asStatusCode(status: number): ContentfulStatusCode {
  return status as ContentfulStatusCode;
}
