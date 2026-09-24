import { createGatewayWorkerApp } from "./app.js";
import type { GatewayWorkerEnv } from "./env.js";

export default {
  fetch(request: Request, env: GatewayWorkerEnv) {
    return createGatewayWorkerApp({ env }).fetch(request, env);
  },
};
