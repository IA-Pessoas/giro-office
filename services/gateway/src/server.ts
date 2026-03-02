import { createServer } from "node:http";

import { serverError, serverStart } from "@workspace/shared";

import { createApp } from "./app.js";
import { getGatewayEnv } from "./config/env.js";
import { proxyWebSocketUpgrade } from "./proxy/wsProxy.js";

const env = getGatewayEnv();
const app = createApp(env);
const server = createServer(app);

server.on("upgrade", (request, socket, head) => {
  if (!request.url?.startsWith("/socket.io")) {
    socket.destroy();
    return;
  }

  proxyWebSocketUpgrade(request, socket, head, env.legacyApiUrl);
});

server.listen(env.port, () => {
  serverStart({ port: env.port, upstream: env.legacyApiUrl });
});

server.on("error", (err) => {
  serverError("Erro no servidor gateway", err);
});
