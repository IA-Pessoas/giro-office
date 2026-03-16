import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared";
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
    headers.set(REQUEST_ID_HEADER, request.requestId);
  }

  if (request.auth) {
    headers.set(FORWARDED_AUTH_USER_ID_HEADER, request.auth.userId);
    headers.set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, request.auth.organizationId);

    if (typeof request.auth.claims.permission === "number") {
      headers.set(FORWARDED_AUTH_PERMISSION_HEADER, String(request.auth.claims.permission));
    }
  }

  return headers;
}

export type UpstreamResolver = (method: string, path: string) => string;

function createHttpProxy(resolveTargetUrl: (request: Request) => string) {
  return async function httpProxy(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const targetUrl = resolveTargetUrl(request);
    const upstreamUrl = new URL(request.originalUrl, targetUrl).toString();
    const body = getRequestBody(request);

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers: buildForwardHeaders(request),
        body,
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
      next(new ServiceError(502, "Erro ao comunicar com o serviço upstream.", error));
    }
  };
}

export function buildHttpProxyMiddleware(targetUrlOrResolver: string | UpstreamResolver) {
  if (typeof targetUrlOrResolver === "string") {
    return createHttpProxy(() => targetUrlOrResolver);
  }
  return createHttpProxy((request) => targetUrlOrResolver(request.method, request.path));
}
