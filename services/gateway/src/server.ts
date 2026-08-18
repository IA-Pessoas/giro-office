import { createServer } from "node:http";

import { createLogger } from "@workspace/shared";

import { createApp } from "./app.js";
import { getGatewayEnv } from "./config/env.js";
import { createUserServiceSessionValidator } from "./middlewares/authenticate.js";
import { isAuthorizedWebSocketUpgrade } from "./middlewares/websocketAuthorize.js";
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
const sessionValidator = createUserServiceSessionValidator(
  env.userServiceUrl,
  env.auditServiceToken,
);
const app = createApp(env, logger, {
  sessionValidator,
});
const server = createServer(app);

server.on("upgrade", async (request, socket, head) => {
  const requestPath = request.url?.split("?", 1)[0];
  if (requestPath !== "/socket.io" && !requestPath?.startsWith("/socket.io/")) {
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

  const authorized = await isAuthorizedWebSocketUpgrade(
    request.headers.authorization,
    env.jwtSecret,
    sessionValidator,
  );
  if (!authorized) {
    logger.warn({
      event: "ws.upgrade.denied",
      message: "WebSocket upgrade denied because authentication failed.",
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
