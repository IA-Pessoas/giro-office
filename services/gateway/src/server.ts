import { createServer } from "node:http";

import { createLogger } from "@workspace/shared";

import { createApp } from "./app.js";
import { getGatewayEnv } from "./config/env.js";
import { proxyWebSocketUpgrade } from "./proxy/wsProxy.js";

function getUpstreamContext(url: string): { host?: string; path?: string } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      path: parsed.pathname,
    };
  } catch {
    return {};
  }
}

const env = getGatewayEnv();
const logger = createLogger({
  service: "gateway",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const app = createApp(env, logger);
const server = createServer(app);

server.on("upgrade", (request, socket, head) => {
  if (!request.url?.startsWith("/socket.io")) {
    socket.destroy();
    return;
  }

  if (!env.websocketUpstreamUrl) {
    logger.warn({
      event: "ws.upgrade.skipped",
      message: "WEBSOCKET_UPSTREAM_URL não definido; encerrando socket.",
    });
    socket.destroy();
    return;
  }

  proxyWebSocketUpgrade(request, socket, head, env.websocketUpstreamUrl);
});

server.listen(env.port, () => {
  logger.info({
    event: "server.start",
    message: "Gateway server started",
    data: {
      port: env.port,
      websocketUpstream: env.websocketUpstreamUrl
        ? getUpstreamContext(env.websocketUpstreamUrl)
        : undefined,
    },
  });
});

server.on("error", (err) => {
  logger.error({
    event: "server.error",
    message: "Gateway server error",
    err,
  });
});
