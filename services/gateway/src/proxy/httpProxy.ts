import { Readable } from "node:stream";
import type { NextFunction, Request, Response } from "express";

function hasRequestBody(method: string): boolean {
  const upperMethod = method.toUpperCase();
  return upperMethod !== "GET" && upperMethod !== "HEAD";
}

async function readRawBody(request: Request): Promise<Buffer | undefined> {
  if (!hasRequestBody(request.method)) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function buildForwardHeaders(request: Request): Headers {
  const headers = new Headers();

  Object.entries(request.headers).forEach(([key, value]) => {
    if (!value) return;
    if (key === "host" || key === "content-length") return;

    if (Array.isArray(value)) {
      headers.set(key, value.join(","));
      return;
    }

    headers.set(key, value);
  });

  headers.set("x-forwarded-host", request.headers.host ?? "");
  headers.set("x-forwarded-proto", request.protocol);
  headers.set("x-forwarded-for", request.ip ?? "");

  if (request.requestId) {
    headers.set("x-request-id", request.requestId);
  }

  if (request.auth) {
    headers.set("x-auth-user-id", request.auth.userId);

    if (typeof request.auth.claims.permission === "number") {
      headers.set("x-auth-permission", String(request.auth.claims.permission));
    }
  }

  return headers;
}

export function buildHttpProxyMiddleware(legacyApiUrl: string) {
  return async function httpProxy(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      const targetUrl = new URL(request.originalUrl, legacyApiUrl).toString();
      const rawBody = await readRawBody(request);

      const upstreamResponse = await fetch(targetUrl, {
        method: request.method,
        headers: buildForwardHeaders(request),
        body: rawBody,
        redirect: "manual"
      });

      response.status(upstreamResponse.status);

      upstreamResponse.headers.forEach((value, key) => {
        if (key === "transfer-encoding") return;
        response.setHeader(key, value);
      });

      if (!upstreamResponse.body) {
        response.end();
        return;
      }

      Readable.fromWeb(upstreamResponse.body as never).pipe(response);
    } catch (error) {
      next(error);
    }
  };
}
