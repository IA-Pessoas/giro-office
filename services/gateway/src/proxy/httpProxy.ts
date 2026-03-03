import type { NextFunction, Request, Response } from "express";

function hasRequestBody(method: string): boolean {
  const upperMethod = method.toUpperCase();
  return upperMethod !== "GET" && upperMethod !== "HEAD";
}

function getRequestBody(request: Request): string | undefined {
  if (!hasRequestBody(request.method) || request.body === undefined) {
    return undefined;
  }
  return JSON.stringify(request.body);
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
      const body = getRequestBody(request);

      const upstreamResponse = await fetch(targetUrl, {
        method: request.method,
        headers: buildForwardHeaders(request),
        body,
        redirect: "manual"
      });

      response.status(upstreamResponse.status);

      upstreamResponse.headers.forEach((value, key) => {
        if (key === "transfer-encoding") return;
        response.setHeader(key, value);
      });

      if (!upstreamResponse.body || [204, 205].includes(upstreamResponse.status)) {
        response.end();
        return;
      }

      const data = await upstreamResponse.json();
      response.json(data);
    } catch (error) {
      next(error);
    }
  };
}
