import { Readable } from "node:stream";

import {
  AUTH_SESSION_TRANSPORT_HEADER,
  CSRF_HEADER_NAME,
  FORWARDED_AUTH_CSRF_HASH_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_SESSION_ID_HEADER,
  FORWARDED_AUTH_SESSION_VERSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTEGRACAO_PERMISSION_LEVEL,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
  stripBrowserAuth,
} from "@workspace/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";

function hasRequestBody(method: string): boolean {
  const upperMethod = method.toUpperCase();
  return upperMethod !== "GET" && upperMethod !== "HEAD";
}

function getRequestBody(request: Request): string | ReadableStream | undefined {
  if (!hasRequestBody(request.method)) {
    return undefined;
  }
  if (request.headers["content-type"]?.includes("application/json")) {
    return JSON.stringify(request.body ?? {});
  }
  if (request.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
    // If it was parsed by express.urlencoded
    if (request.body && Object.keys(request.body).length > 0) {
      return new URLSearchParams(request.body).toString();
    }
  }
  return Readable.toWeb(request) as unknown as ReadableStream;
}

export interface HttpProxyOptions {
  internalServiceToken?: string;
  permissionModule?: string;
  forwardSessionBinding?: boolean;
}

const OWNER_MODULE_PERMISSION = 3;

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function getConnectionHeaderTokens(request: Request): Set<string> {
  const rawConnectionHeader = request.headers.connection;
  const tokens = new Set<string>();

  if (!rawConnectionHeader) {
    return tokens;
  }

  const connectionHeader = Array.isArray(rawConnectionHeader)
    ? rawConnectionHeader.join(",")
    : rawConnectionHeader;

  for (const token of connectionHeader.split(",")) {
    const normalizedToken = token.trim().toLowerCase();
    if (normalizedToken) {
      tokens.add(normalizedToken);
    }
  }

  return tokens;
}

function resolveForwardedPermission(
  permission: number | undefined,
  modules: Record<string, number> | undefined,
  modulePermissionsPresent: boolean | undefined,
  type: unknown,
  permissionModule?: string,
): number | undefined {
  if (!permissionModule) {
    return permission;
  }

  const isExplicitOwner = type === "owner";
  if (isExplicitOwner) {
    return OWNER_MODULE_PERMISSION;
  }

  if (modulePermissionsPresent === false) {
    return INTEGRACAO_PERMISSION_LEVEL.BASIC;
  }

  const modulePermission = modules?.[permissionModule];

  if (typeof modulePermission === "number") {
    return modulePermission;
  }

  return undefined;
}

export function buildForwardHeaders(request: Request, options: HttpProxyOptions = {}): Headers {
  const headers = new Headers();
  const connectionHeaderTokens = getConnectionHeaderTokens(request);
  const strippedClientHeaders = new Set([
    INTERNAL_SERVICE_TOKEN_HEADER,
    FORWARDED_AUTH_USER_ID_HEADER,
    FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
    FORWARDED_AUTH_PERMISSION_HEADER,
    FORWARDED_AUTH_TYPE_HEADER,
    FORWARDED_AUTH_MODULES_HEADER,
    FORWARDED_AUTH_SESSION_VERSION_HEADER,
    FORWARDED_AUTH_SESSION_ID_HEADER,
    FORWARDED_AUTH_CSRF_HASH_HEADER,
    "authorization",
    "cookie",
    AUTH_SESSION_TRANSPORT_HEADER,
    CSRF_HEADER_NAME,
  ]);

  Object.entries(request.headers).forEach(([key, value]) => {
    const normalizedKey = key.toLowerCase();

    if (!value) return;
    if (HOP_BY_HOP_HEADERS.has(normalizedKey)) return;
    if (connectionHeaderTokens.has(normalizedKey)) return;
    if (strippedClientHeaders.has(normalizedKey)) return;

    if (Array.isArray(value)) {
      headers.set(key, value.join(","));
      return;
    }

    headers.set(key, value);
  });

  const cookieHeader = Array.isArray(request.headers.cookie)
    ? request.headers.cookie.join("; ")
    : request.headers.cookie;
  const forwardedCookie = stripBrowserAuth(cookieHeader);
  if (forwardedCookie) {
    headers.set("cookie", forwardedCookie);
  }

  headers.set("x-forwarded-host", request.headers.host ?? "");
  headers.set("x-forwarded-proto", request.protocol);
  headers.set("x-forwarded-for", request.ip ?? "");

  if (request.requestId) {
    headers.set(REQUEST_ID_HEADER, request.requestId);
  }

  if (request.auth) {
    headers.set(FORWARDED_AUTH_USER_ID_HEADER, request.auth.userId);
    headers.set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, request.auth.organizationId);

    const modules = request.auth.claims.modules as Record<string, number> | undefined;
    const forwardedPermission = resolveForwardedPermission(
      request.auth.claims.permission,
      modules,
      request.auth.claims.modulePermissionsPresent,
      request.auth.claims.type,
      options.permissionModule,
    );

    if (typeof forwardedPermission === "number") {
      headers.set(FORWARDED_AUTH_PERMISSION_HEADER, String(forwardedPermission));
    }

    const authType = request.auth.claims.type;
    if (typeof authType === "string") {
      headers.set(FORWARDED_AUTH_TYPE_HEADER, authType);
    }

    if (modules) {
      headers.set(FORWARDED_AUTH_MODULES_HEADER, JSON.stringify(modules));
    }

    if (typeof request.auth.claims.session_version === "number") {
      headers.set(
        FORWARDED_AUTH_SESSION_VERSION_HEADER,
        String(request.auth.claims.session_version),
      );
    }
    if (options.forwardSessionBinding) {
      if (request.auth.claims.session_id) {
        headers.set(FORWARDED_AUTH_SESSION_ID_HEADER, request.auth.claims.session_id);
      }
      if (request.auth.claims.csrf_hash) {
        headers.set(FORWARDED_AUTH_CSRF_HASH_HEADER, request.auth.claims.csrf_hash);
      }
    }
  }

  if (options.internalServiceToken) {
    headers.set(INTERNAL_SERVICE_TOKEN_HEADER, options.internalServiceToken);
  }

  return headers;
}

export type UpstreamResolver = (method: string, path: string) => string;

/** Colapsa barras consecutivas no path (ex.: /rh//holidays/ → /rh/holidays/), preservando query string. */
function normalizePathForUpstream(originalUrl: string): string {
  const queryIndex = originalUrl.indexOf("?");
  const pathPart = queryIndex === -1 ? originalUrl : originalUrl.slice(0, queryIndex);
  const queryPart = queryIndex === -1 ? "" : originalUrl.slice(queryIndex);
  const normalizedPath = pathPart.replace(/\/{2,}/g, "/");
  return normalizedPath + queryPart;
}

function getSessionCookieHeaders(request: Request, upstreamHeaders: Headers): string[] {
  const path = new URL(request.originalUrl, "http://gateway.local").pathname;
  if (path !== "/user/session" && path !== "/user/session/refresh") {
    return [];
  }

  return upstreamHeaders
    .getSetCookie()
    .filter((header) => /^(?:cw\.session|cw\.csrf)=/u.test(header));
}

function createHttpProxy(
  resolveTargetUrl: (request: Request) => string,
  options: HttpProxyOptions = {},
): RequestHandler {
  return async function httpProxy(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const targetUrl = resolveTargetUrl(request);
    const upstreamUrl = new URL(
      normalizePathForUpstream(request.originalUrl),
      targetUrl,
    ).toString();
    const body = getRequestBody(request);

    try {
      const fetchOptions: RequestInit = {
        method: request.method,
        headers: buildForwardHeaders(request, options),
        body: body as RequestInit["body"],
      };

      if (body !== undefined && typeof body !== "string") {
        (fetchOptions as RequestInit & { duplex: "half" }).duplex = "half";
      }

      const upstreamResponse = await fetch(upstreamUrl, fetchOptions);

      response.status(upstreamResponse.status);

      upstreamResponse.headers.forEach((value, key) => {
        if (key === "transfer-encoding" || key === "set-cookie") return;
        response.setHeader(key, value);
      });
      const sessionCookieHeaders = getSessionCookieHeaders(request, upstreamResponse.headers);
      if (sessionCookieHeaders.length > 0) {
        response.setHeader("set-cookie", sessionCookieHeaders);
      }

      if (!upstreamResponse.body || [204, 205].includes(upstreamResponse.status)) {
        response.end();
        return;
      }

      const data = Buffer.from(await upstreamResponse.arrayBuffer());
      response.send(data);
    } catch (error) {
      next(new ServiceError(502, "Erro ao comunicar com o serviço upstream.", error));
    }
  };
}

export function buildHttpProxyMiddleware(
  targetUrlOrResolver: string | UpstreamResolver,
  options: HttpProxyOptions = {},
): RequestHandler {
  if (typeof targetUrlOrResolver === "string") {
    return createHttpProxy(() => targetUrlOrResolver, options);
  }
  return createHttpProxy((request) => targetUrlOrResolver(request.method, request.path), options);
}
