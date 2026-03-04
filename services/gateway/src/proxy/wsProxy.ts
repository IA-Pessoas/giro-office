import * as http from "node:http";
import * as https from "node:https";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

function serializeHeaders(headers: IncomingHttpHeaders): string {
  const lines: string[] = [];

  Object.entries(headers).forEach(([name, value]) => {
    if (typeof value === "undefined") return;

    if (Array.isArray(value)) {
      value.forEach((item) => lines.push(`${name}: ${item}`));
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
  upstreamUrl: string
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
    headers: request.headers
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
