import { createServer } from "node:http";

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
  console.log(`Gateway ativo na porta ${env.port}`);
  console.log(`Upstream legado configurado em ${env.legacyApiUrl}`);
});

server.on("error", (error) => {
  console.error("Erro no servidor gateway:", error);
});
