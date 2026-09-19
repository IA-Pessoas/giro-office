import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { REQUEST_ID_HEADER } from "./headers.js";

/**
 * Propaga o id de correlação: reaproveita o que veio do gateway ou cria um, e
 * devolve no cabeçalho da resposta.
 *
 * Cada serviço declara `requestId` no Express à sua maneira (`src/types.d.ts`),
 * e o shared não participa dessas augmentações globais — daí o cast pontual.
 */
export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const requestId = String(request.headers[REQUEST_ID_HEADER] ?? randomUUID());

  (request as Request & { requestId?: string }).requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
