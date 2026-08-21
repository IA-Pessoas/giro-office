import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import * as http from "node:http";
import * as https from "node:https";
import type { Duplex } from "node:stream";

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
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";

const STRIPPED_BROWSER_HEADERS = new Set([
  "authorization",
  "cookie",
  AUTH_SESSION_TRANSPORT_HEADER,
  CSRF_HEADER_NAME,
  INTERNAL_SERVICE_TOKEN_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_SESSION_VERSION_HEADER,
  FORWARDED_AUTH_SESSION_ID_HEADER,
  FORWARDED_AUTH_CSRF_HASH_HEADER,
]);

export function buildWebSocketHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !STRIPPED_BROWSER_HEADERS.has(name.toLowerCase())),
  );
}

function serializeHeaders(headers: IncomingHttpHeaders): string {
  const lines: string[] = [];

  Object.entries(headers).forEach(([name, value]) => {
    if (typeof value === "undefined") return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        lines.push(`${name}: ${item}`);
      });
      return;
    }

    lines.push(`${name}: ${value}`);
  });

  return lines.join("\r\n");
}

export function proxyWebSocketUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  upstreamUrl: string,
): void {
  const target = new URL(upstreamUrl);
  const isSecure = target.protocol === "wss:" || target.protocol === "https:";
  const transport = isSecure ? https : http;
  const defaultPort = isSecure ? 443 : 80;

  const upstreamRequest = transport.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port ? Number.parseInt(target.port, 10) : defaultPort,
    method: request.method,
    path: request.url,
    headers: buildWebSocketHeaders(request.headers),
  });

  upstreamRequest.on("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
    const statusLine = `HTTP/1.1 ${upstreamResponse.statusCode ?? 101} ${upstreamResponse.statusMessage ?? "Switching Protocols"}`;
    const headerLines = serializeHeaders(upstreamResponse.headers);

    socket.write(`${statusLine}\r\n${headerLines}\r\n\r\n`);

    if (upstreamHead.length > 0) {
      socket.write(upstreamHead);
    }

    if (head.length > 0) {
      upstreamSocket.write(head);
    }

    upstreamSocket.pipe(socket).pipe(upstreamSocket);
  });

  upstreamRequest.on("error", () => {
    socket.destroy();
  });

  upstreamRequest.end();
}
